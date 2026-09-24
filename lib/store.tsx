"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Meeting, MeetingStatus, NewMeetingInput } from "./types";

interface MeetingsContextValue {
  meetings: Meeting[];
  ready: boolean;
  createMeeting: (input: NewMeetingInput) => Promise<Meeting>;
  updateMeeting: (id: string, patch: Partial<Meeting>) => void;
  setStatus: (id: string, status: MeetingStatus) => void;
  getMeeting: (id: string) => Meeting | undefined;
  deleteMeeting: (id: string) => void;
}

const MeetingsContext = createContext<MeetingsContextValue | null>(null);

export function MeetingsProvider({ children }: { children: React.ReactNode }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/meetings")
      .then((r) => r.json())
      .then((data: Meeting[]) => setMeetings(data))
      .finally(() => setReady(true));
  }, []);

  const createMeeting = useCallback(async (input: NewMeetingInput) => {
    const res = await fetch("/api/meetings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const meeting = (await res.json()) as Meeting;
    setMeetings((prev) => [meeting, ...prev]);
    return meeting;
  }, []);

  const updateMeeting = useCallback((id: string, patch: Partial<Meeting>) => {
    setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    fetch(`/api/meetings/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }, []);

  const setStatus = useCallback(
    (id: string, status: MeetingStatus) => updateMeeting(id, { status }),
    [updateMeeting]
  );

  const getMeeting = useCallback(
    (id: string) => meetings.find((m) => m.id === id),
    [meetings]
  );

  const deleteMeeting = useCallback((id: string) => {
    setMeetings((prev) => prev.filter((m) => m.id !== id));
    fetch(`/api/meetings/${id}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      meetings,
      ready,
      createMeeting,
      updateMeeting,
      setStatus,
      getMeeting,
      deleteMeeting,
    }),
    [meetings, ready, createMeeting, updateMeeting, setStatus, getMeeting, deleteMeeting]
  );

  return (
    <MeetingsContext.Provider value={value}>
      {children}
    </MeetingsContext.Provider>
  );
}

export function useMeetings() {
  const ctx = useContext(MeetingsContext);
  if (!ctx) throw new Error("useMeetings must be used within MeetingsProvider");
  return ctx;
}
