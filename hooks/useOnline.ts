"use client";
/**
 * Peer-to-peer room via PeerJS (WebRTC data channel). No account needed:
 * signalling goes through the free PeerJS cloud broker, game data flows
 * directly between the two devices (or via PeerJS's public TURN relay when
 * mobile networks block direct connections).
 *
 * shortcut: public PeerJS broker, no uptime guarantee; self-host `peer` and set
 * NEXT_PUBLIC_PEER_HOST/PORT/PATH if it becomes unreliable.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DataConnection, Peer, PeerOptions } from "peerjs";
import { type GuestMessage, type HostMessage, type Role, newRoomCode, peerIdFor } from "@/lib/net";

export type NetStatus = "idle" | "opening" | "waiting" | "joining" | "connected" | "disconnected" | "error";

function peerOptions(): PeerOptions {
  const host = process.env.NEXT_PUBLIC_PEER_HOST;
  if (!host) return { debug: 0 };
  return {
    debug: 0,
    host,
    port: Number(process.env.NEXT_PUBLIC_PEER_PORT ?? 443),
    path: process.env.NEXT_PUBLIC_PEER_PATH ?? "/",
    secure: process.env.NEXT_PUBLIC_PEER_SECURE !== "false",
  };
}

interface Handlers {
  /** Host receives guest intents; guest receives host snapshots. */
  onMessage: (msg: HostMessage | GuestMessage) => void;
  /** Host only: a guest (re)connected — send it the current state. */
  onGuestJoined?: () => void;
}

export function useOnline(handlers: Handlers) {
  const [role, setRole] = useState<Role>("local");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<NetStatus>("idle");
  const [error, setError] = useState("");
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const handlersRef = useRef(handlers);
  const codeRef = useRef("");
  const retryRef = useRef({ n: 0, timer: 0 });
  codeRef.current = code;

  useEffect(() => {
    handlersRef.current = handlers;
  });

  const genRef = useRef(0); // bumped on every teardown so events from an old connection are ignored
  const teardown = () => {
    genRef.current += 1;
    connRef.current?.close();
    peerRef.current?.destroy();
    connRef.current = null;
    peerRef.current = null;
  };
  useEffect(() => teardown, []);

  const fail = (message: string) => {
    setError(message);
    setStatus("error");
  };

  /** Guest: rejoin the same room with growing delays (1s, 2s, 3s, 5s…), up to 10 tries. */
  const scheduleRetry = () => {
    const r = retryRef.current;
    window.clearTimeout(r.timer);
    if (r.n >= 10) return;
    r.timer = window.setTimeout(() => {
      r.n += 1;
      if (codeRef.current) void joinRef.current(codeRef.current);
    }, Math.min(5000, 1000 * (r.n + 1)));
  };
  const joinRef = useRef<(c: string) => Promise<void>>(async () => {});

  /** Wire a data connection (both roles). */
  const attach = useCallback((conn: DataConnection, asHost: boolean) => {
    const gen = genRef.current;
    conn.on("open", () => {
      if (asHost && connRef.current && connRef.current !== conn) connRef.current.close(); // one partner per room
      connRef.current = conn;
      setStatus("connected");
      setError("");
      retryRef.current.n = 0;
      window.clearTimeout(retryRef.current.timer);
      if (asHost) handlersRef.current.onGuestJoined?.();
    });
    conn.on("data", (data) => {
      // Validate shape at the trust boundary: only plain objects with a known tag.
      if (data && typeof data === "object" && typeof (data as { t?: unknown }).t === "string") {
        handlersRef.current.onMessage(data as HostMessage | GuestMessage);
      }
    });
    const dropped = () => {
      if (gen !== genRef.current) return;
      if (connRef.current === conn || !connRef.current) {
        connRef.current = null;
        setStatus(asHost ? "waiting" : "disconnected");
        if (!asHost) scheduleRetry();
      }
    };
    conn.on("close", dropped);
    conn.on("error", dropped);
  }, []);

  /** Create a room; retries with a fresh code if the id is taken. */
  const host = useCallback(async () => {
    teardown();
    setRole("host");
    setStatus("opening");
    setError("");
    const { Peer } = await import("peerjs");
    const open = (attempt: number) => {
      const roomCode = newRoomCode();
      const peer = new Peer(peerIdFor(roomCode), peerOptions());
      peerRef.current = peer;
      peer.on("open", () => {
        setCode(roomCode);
        setStatus("waiting");
      });
      peer.on("connection", (conn) => attach(conn, true));
      peer.on("disconnected", () => {
        if (!peer.destroyed) peer.reconnect(); // lost the broker, keep the room id
      });
      peer.on("error", (err) => {
        if (err.type === "unavailable-id" && attempt < 4) {
          peer.destroy();
          open(attempt + 1);
        } else if (err.type === "network" || err.type === "server-error" || err.type === "socket-error") {
          fail("Cannot reach the room server. Check the internet connection and try again.");
        }
      });
    };
    open(0);
  }, [attach]);

  /** Join a room by its 4-letter code. */
  const join = useCallback(
    async (roomCode: string) => {
      teardown();
      setRole("guest");
      setCode(roomCode);
      setStatus("joining");
      setError("");
      const { Peer } = await import("peerjs");
      const peer = new Peer(peerOptions());
      peerRef.current = peer;
      peer.on("open", () => attach(peer.connect(peerIdFor(roomCode), { reliable: true, serialization: "json" }), false));
      peer.on("error", (err) => {
        if (err.type === "peer-unavailable") fail(`Room ${roomCode} not found. Check the code, or ask the host to create it again.`);
        else if (err.type === "network" || err.type === "server-error" || err.type === "socket-error")
          fail("Cannot reach the room server. Check the internet connection and try again.");
      });
    },
    [attach],
  );

  useEffect(() => {
    joinRef.current = join;
  }, [join]);

  // A phone that slept (or a laptop that woke) usually has a dead socket: revive it right away.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      if (role === "guest" && status !== "connected" && codeRef.current) void joinRef.current(codeRef.current);
      if (role === "host" && peerRef.current?.disconnected && !peerRef.current.destroyed) peerRef.current.reconnect();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [role, status]);

  // Warm the PeerJS chunk while the player is still on the lobby, so "Create room" feels instant.
  useEffect(() => {
    const id = window.setTimeout(() => void import("peerjs"), 2500);
    return () => window.clearTimeout(id);
  }, []);

  const leave = useCallback(() => {
    window.clearTimeout(retryRef.current.timer);
    retryRef.current.n = 0;
    teardown();
    setRole("local");
    setCode("");
    setStatus("idle");
    setError("");
  }, []);

  const send = useCallback((msg: HostMessage | GuestMessage) => {
    const conn = connRef.current;
    if (conn?.open) conn.send(msg);
  }, []);

  return { role, code, status, error, host, join, leave, send };
}

export type Online = ReturnType<typeof useOnline>;
