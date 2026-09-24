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

const STORAGE_KEY = "crmaster.meetings.v1";

function loadMeetings(): Meeting[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Meeting[]) : [];
  } catch {
    return [];
  }
}

function saveMeetings(meetings: Meeting[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
}

interface MeetingsContextValue {
  meetings: Meeting[];
  ready: boolean;
  createMeeting: (input: NewMeetingInput) => Meeting;
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
    setMeetings(loadMeetings());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) saveMeetings(meetings);
  }, [meetings, ready]);

  const createMeeting = useCallback((input: NewMeetingInput) => {
    const meeting: Meeting = {
      id: crypto.randomUUID(),
      ...input,
      status: "planifiee",
      transcriptionStatus: "indisponible",
      notionStatus: "non_configure",
      recordingDurationSec: null,
      createdAt: new Date().toISOString(),
    };
    setMeetings((prev) => [meeting, ...prev]);
    return meeting;
  }, []);

  const updateMeeting = useCallback((id: string, patch: Partial<Meeting>) => {
    setMeetings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
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
