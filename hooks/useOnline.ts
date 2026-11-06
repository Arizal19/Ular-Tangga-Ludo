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

  useEffect(() => {
    handlersRef.current = handlers;
  });

  const teardown = () => {
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

  /** Wire a data connection (both roles). */
  const attach = useCallback((conn: DataConnection, asHost: boolean) => {
    conn.on("open", () => {
      if (asHost && connRef.current && connRef.current !== conn) connRef.current.close(); // one partner per room
      connRef.current = conn;
      setStatus("connected");
      setError("");
      if (asHost) handlersRef.current.onGuestJoined?.();
    });
    conn.on("data", (data) => {
      // Validate shape at the trust boundary: only plain objects with a known tag.
      if (data && typeof data === "object" && typeof (data as { t?: unknown }).t === "string") {
        handlersRef.current.onMessage(data as HostMessage | GuestMessage);
      }
    });
    conn.on("close", () => {
      if (connRef.current === conn) {
        connRef.current = null;
        setStatus(asHost ? "waiting" : "disconnected");
      }
    });
    conn.on("error", () => setStatus(asHost ? "waiting" : "disconnected"));
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

  const leave = useCallback(() => {
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
