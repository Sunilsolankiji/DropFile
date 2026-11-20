import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '@/lib/config';
import { getOrCreateDeviceId, getOrCreateDeviceName, useDeviceName } from '@/lib/device';
import { NearbyService, type NearbyConnectionState, type NearbyInvite, type NearbyPeer } from '@/lib/nearby-service';
import { P2PNetwork } from '@/lib/rtc/p2p-network';
import { getIceServers, warmUpWebRtc } from '@/lib/rtc/ice';
import { TransferCancelledError, type IncomingFile } from '@/lib/rtc/p2p-session';
import { detectDeviceType, generateAccessCode, saveBlobAsFile } from '@/lib/utils';
import { MAX_FILE_SIZE } from '@/lib/transfer-types';
import { queueRoomUploads } from '@/lib/pending-uploads';

export type NearbyTransferStatus =
  | 'connecting' | 'waiting' | 'sending' | 'receiving' | 'done' | 'declined' | 'failed' | 'cancelled';

export interface NearbyTransfer {
  id: string;
  peerId: string;
  peerName: string;
  direction: 'outgoing' | 'incoming';
  name: string;
  size: number;
  bytes: number;
  status: NearbyTransferStatus;
  error?: string;
  /** True when no direct connection was possible; the UI offers the server relay instead. */
  canUseRelay?: boolean;
  /** When the first bytes moved, for speed estimates. */
  startedAt?: number;
}

export interface PendingOffer {
  offer: IncomingFile;
  peerId: string;
  peerName: string;
}

const OFFER_TIMEOUT_MS = 60000;
const CONNECT_TIMEOUT_MS = 10000;

function localId(): string {
  return `nt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useNearby() {
  const [peers, setPeers] = useState<NearbyPeer[]>([]);
  const [connection, setConnection] = useState<NearbyConnectionState>('connecting');
  const [connectionMessage, setConnectionMessage] = useState<string | undefined>();
  const [lanMode, setLanMode] = useState(false);
  const [transfers, setTransfers] = useState<NearbyTransfer[]>([]);
  const [offers, setOffers] = useState<PendingOffer[]>([]);
  const [invite, setInvite] = useState<NearbyInvite | null>(null);
  const deviceName = useDeviceName();
  const supported = P2PNetwork.isSupported();

  const serviceRef = useRef<NearbyService | null>(null);
  const networkRef = useRef<P2PNetwork | null>(null);
  const peersRef = useRef<NearbyPeer[]>([]);
  const offerResolvers = useRef(new Map<string, (accept: boolean) => void>());
  const cancellers = useRef(new Map<string, () => void>());
  const failedFiles = useRef(new Map<string, File>());

  const patch = useCallback((id: string, changes: Partial<NearbyTransfer>) => {
    setTransfers(previous => previous.map(transfer => {
      if (transfer.id !== id) return transfer;
      const startedAt = transfer.startedAt ?? (changes.bytes ? Date.now() : undefined);
      return { ...transfer, ...changes, startedAt };
    }));
  }, []);

  const peerName = (peerId: string) => peersRef.current.find(peer => peer.id === peerId)?.name ?? 'Nearby device';

  useEffect(() => {
    let mounted = true;
    const deviceId = getOrCreateDeviceId();
    const service = new NearbyService(API_URL, deviceId, getOrCreateDeviceName(), detectDeviceType(), {
      onPeers: next => {
        peersRef.current = next;
        if (mounted) setPeers(next);
      },
      onConnection: (state, message, lan) => {
        if (!mounted) return;
        setConnection(state);
        setConnectionMessage(message);
        if (lan !== undefined) setLanMode(lan);
      },
      onSignal: (fromPeerId, data) => { void networkRef.current?.handleSignal(fromPeerId, data); },
      onInvite: next => { if (mounted) setInvite(next); },
      onPeerLeft: peerId => networkRef.current?.disconnect(peerId, 'The other device left'),
    });

    const network = supported ? new P2PNetwork(deviceId, { send: (target, data) => service.sendSignal(target, data) }, sender => ({
      onOffer: offer => new Promise<boolean>(resolve => {
        const timer = setTimeout(() => settle(false), OFFER_TIMEOUT_MS);
        const settle = (accept: boolean) => {
          clearTimeout(timer);
          offerResolvers.current.delete(offer.id);
          if (mounted) setOffers(previous => previous.filter(item => item.offer.id !== offer.id));
          if (accept && mounted) {
            setTransfers(previous => [{
              id: offer.id, peerId: sender, peerName: peerName(sender), direction: 'incoming',
              name: offer.name, size: offer.size, bytes: 0, status: 'receiving',
            }, ...previous]);
          }
          resolve(accept);
        };
        offerResolvers.current.set(offer.id, settle);
        if (mounted) setOffers(previous => [...previous, { offer, peerId: sender, peerName: peerName(sender) }]);
      }),
      onIncomingProgress: (offer, bytes) => { if (mounted) patch(offer.id, { bytes }); },
      onIncomingComplete: (offer, blob) => {
        saveBlobAsFile(offer.name, blob);
        if (mounted) patch(offer.id, { bytes: offer.size, status: 'done' });
      },
      onIncomingFailed: (offer, reason) => {
        offerResolvers.current.get(offer.id)?.(false);
        if (mounted) patch(offer.id, { status: /cancel/i.test(reason) ? 'cancelled' : 'failed', error: reason });
      },
    })) : null;

    serviceRef.current = service;
    networkRef.current = network;
    if (network) {
      void getIceServers();
      warmUpWebRtc();
    }
    service.connect();
    return () => {
      mounted = false;
      for (const settle of offerResolvers.current.values()) settle(false);
      for (const cancel of cancellers.current.values()) cancel();
      network?.dispose();
      service.disconnect();
      if (networkRef.current === network) networkRef.current = null;
      if (serviceRef.current === service) serviceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, patch]);

  const sendFiles = useCallback(async (peerId: string, files: File[]) => {
    const network = networkRef.current;
    const name = peerName(peerId);
    for (const file of files) {
      const id = localId();
      if (file.size > MAX_FILE_SIZE) {
        setTransfers(previous => [{ id, peerId, peerName: name, direction: 'outgoing', name: file.name, size: file.size, bytes: 0, status: 'failed', error: 'Files must be 2 GB or smaller.' }, ...previous]);
        continue;
      }
      setTransfers(previous => [{ id, peerId, peerName: name, direction: 'outgoing', name: file.name, size: file.size, bytes: 0, status: 'connecting' }, ...previous]);
      if (!network) {
        failedFiles.current.set(id, file);
        patch(id, { status: 'failed', error: 'This browser cannot connect directly to other devices.', canUseRelay: true });
        continue;
      }
      const controller = new AbortController();
      cancellers.current.set(id, () => controller.abort());
      try {
        const session = await network.session(peerId, CONNECT_TIMEOUT_MS);
        controller.signal.throwIfAborted();
        patch(id, { status: 'waiting' });
        await session.offerFile(file, bytes => patch(id, { bytes, status: 'sending' }), controller.signal);
        patch(id, { bytes: file.size, status: 'done' });
      } catch (error) {
        if (controller.signal.aborted) {
          patch(id, { status: 'cancelled' });
        } else if (error instanceof TransferCancelledError) {
          patch(id, { status: /declin/i.test(error.message) ? 'declined' : 'cancelled', error: error.message });
        } else {
          failedFiles.current.set(id, file);
          patch(id, { status: 'failed', error: error instanceof Error ? error.message : 'Could not send the file directly.', canUseRelay: true });
        }
      } finally {
        cancellers.current.delete(id);
      }
    }
  }, [patch]);

  const cancelTransfer = useCallback((id: string) => {
    cancellers.current.get(id)?.();
    const transfer = transfers.find(item => item.id === id);
    if (transfer?.direction === 'incoming' && networkRef.current) {
      void networkRef.current.session(transfer.peerId, 1000).then(session => session.cancel(id, 'Cancelled by the receiver')).catch(() => {});
      patch(id, { status: 'cancelled' });
    }
  }, [patch, transfers]);

  const respondToOffer = useCallback((offerId: string, accept: boolean) => {
    offerResolvers.current.get(offerId)?.(accept);
  }, []);

  /**
   * Fallback when a direct connection fails: open a private room, invite the other device, and share
   * the file through the server relay there.
   */
  const sendViaServer = useCallback(async (transferId: string): Promise<string | null> => {
    const transfer = transfers.find(item => item.id === transferId);
    const service = serviceRef.current;
    const file = failedFiles.current.get(transferId);
    if (!transfer || !service || !file) return null;
    const roomCode = `NEAR-${generateAccessCode()}`;
    try {
      await service.invite(transfer.peerId, roomCode);
      failedFiles.current.delete(transferId);
      queueRoomUploads(roomCode, [file]);
      return roomCode;
    } catch (error) {
      patch(transferId, { error: error instanceof Error ? error.message : 'Could not invite the other device.' });
      return null;
    }
  }, [patch, transfers]);

  // The device name is edited in Settings; keep nearby devices up to date.
  useEffect(() => {
    serviceRef.current?.rename(deviceName);
  }, [deviceName]);

  const clearFinished = useCallback(() => {
    setTransfers(previous => previous.filter(item => !['done', 'declined', 'failed', 'cancelled'].includes(item.status)));
  }, []);

  const retry = useCallback(() => serviceRef.current?.connect(), []);

  return {
    supported, peers, connection, connectionMessage, lanMode, transfers, offers, invite, deviceName,
    sendFiles, cancelTransfer, respondToOffer, sendViaServer, clearFinished, retry,
    dismissInvite: () => setInvite(null),
  };
}
