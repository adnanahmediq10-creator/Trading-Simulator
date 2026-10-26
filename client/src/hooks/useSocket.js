/**
 * useSocket — manages Socket.IO connection lifecycle.
 * Returns { socket, connected, reconnecting }
 */
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

let _socket = null;
const API_BASE = import.meta.env.VITE_API_URL || '/api';
const SOCKET_ORIGIN = API_BASE.startsWith('http') ? new URL(API_BASE).origin : '/';

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!_socket) {
      _socket = io(SOCKET_ORIGIN, {
        path: '/socket.io',
        withCredentials: true,
        transports: ['websocket', 'polling'],
      });
    }
    const socket = _socket;

    function onConnect() {
      setConnected(true);
      setReconnecting(false);
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onReconnectAttempt() {
      setReconnecting(true);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.io.on('reconnect', onConnect);

    if (socket.connected) setConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.io.off('reconnect', onConnect);
    };
  }, []);

  return { socket: _socket, connected, reconnecting };
}
