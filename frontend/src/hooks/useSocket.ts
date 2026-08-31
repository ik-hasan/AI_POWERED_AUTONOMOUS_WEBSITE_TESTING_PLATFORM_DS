import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ExecutionUpdate, ExploreUpdate } from '@/types';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3005';

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = io(WS_URL, { transports: ['websocket', 'polling'] });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    setSocket(s);
    return () => { s.disconnect(); };
  }, []);

  const subscribeExecution = useCallback((executionId: string, onUpdate: (data: ExecutionUpdate) => void) => {
    if (!socket) return () => {};
    socket.emit('subscribe:execution', executionId);
    socket.on('execution:update', onUpdate);
    return () => {
      socket.emit('unsubscribe:execution', executionId);
      socket.off('execution:update', onUpdate);
    };
  }, [socket]);

  const subscribeExplore = useCallback((exploreId: string, onUpdate: (data: ExploreUpdate) => void) => {
    if (!socket) return () => {};
    socket.emit('subscribe:explore', exploreId);
    socket.on('explore:update', onUpdate);
    return () => {
      socket.emit('unsubscribe:explore', exploreId);
      socket.off('explore:update', onUpdate);
    };
  }, [socket]);

  return { socket, connected, subscribeExecution, subscribeExplore };
}
