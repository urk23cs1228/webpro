import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

import {
  List,
  ListTodo,
  NotebookPen,
  Quote,
  Settings as SettingsIcon,
} from "lucide-react";
import createSessionData from "./hooks/useSessionData";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useSessionStorage } from "./hooks/useSessionStorage";
import { Settings } from "./components/Setting";
import { Timer } from "./components/Timer";
import { TodoList } from "./components/TodoList";
import MotivationalQuotes from "./components/MotivationalQuotes";
import CurrentProgress from "./components/CurrentProgress";
import Notes from "./components/Notes";
import { SessionReview } from "./components/SessionReview";
import { useSegmentManager } from "./hooks/useSegmentManager";
import sessionService from "../../../../services/sessionService";
import { useAuth } from "../../../../contexts/AuthContext";
import toast from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";

const FocusSession = () => {
  const [showQuotes, setShowQuotes] = useState(false);
  const [activePanel, setActivePanel] = useState("");
  const hasLoggedStart = useRef(false);
  const [hasStartedFocus, setHasStartedFocus] = useState(false);

  const [isLoading, setIsLoading] = useState(true);

  const { user } = useAuth();

  const [breakDuration, setBreakDuration] = useLocalStorage(
    "breakDuration",
    5 * 60
  );
  const [autoStartBreaks, setAutoStartBreaks] = useLocalStorage(
    "autoStartBreaks",
    true
  );
  const [breaksNumber, setBreaksNumber] = useLocalStorage("breaksNumber", 4);
  const [totalFocusDuration, setTotalFocusDuration] = useLocalStorage(
    "totalFocusDuration",
    25 * 60
  );
  const [todos, setTodos] = useSessionStorage("focusTodos", []);
  const [notes, setNotes] = useSessionStorage("notes", [
    {
      id: 1,
      text: "Welcome to your notes!",
      taskId: "",
      createdAt: new Date().toISOString(),
    },
    {
      id: 2,
      text: "Try editing this note.",
      taskId: "",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [sessionHistory, setSessionHistory] = useLocalStorage(
    "sessionHistory",
    []
  );

  const [newTodo, setNewTodo] = useState("");
  const [sessionTitle, setSessionTitle] = useState("Untitled Work");
  const [newSession, setNewSession] = useState(false);
  const [sessionReview, setSessionReview] = useSessionStorage("sessionReview", {
    mood: null,
    focus: null,
    distractions: "",
  });
  const initialSession = useCallback(() => {
    const safeTotalFocus = totalFocusDuration ?? 25 * 60;
    const safeBreak = breakDuration ?? 5 * 60;
    const safeBreaksNum = breaksNumber ?? 4;
    const segments = createSessionData(
      safeTotalFocus,
      safeBreak,
      safeBreaksNum
    );

    setSessionReview({ mood: null, focus: null, distractions: "" });

    return {
      sessionId: uuidv4(),
      title: "Untitled Work",
      segmentIndex: 0,
      totalBreaks: segments.filter((s) => s.type === "break").length,
      breakDuration: safeBreak,
      maxBreaks: safeBreaksNum,
      currentDuration: 0,
      totalDuration: safeTotalFocus,
      segments,
      isDone: false,
      timestamp: new Date().toISOString(),
    };
  }, [totalFocusDuration, breakDuration, breaksNumber, setSessionReview]);

  const [sessionData, setSessionData] = useSessionStorage(
    "sessionData",
    initialSession
  );

  const {
    currentSegmentIndex,
    currentSegment,
    updateSegment,
    timeLeft,
    isStarted,
    start,
    pause,
    reset,
  } = useSegmentManager({
    sessionData,
    setSessionData,
    totalFocusDuration,
    autoStartBreaks,
    setSessionHistory,
  });

  useEffect(() => {
    if (isStarted && currentSegment?.type === "focus" && !hasStartedFocus) {
      setHasStartedFocus(true);
    }
  }, [isStarted, currentSegment, hasStartedFocus]);

  useEffect(() => {
    if (newSession) {
      const fresh = initialSession();
      setSessionData(fresh);
      reset();
      setSessionTitle("Untittled Work");
      setSessionHistory([]);
      setTodos([]);
      setNotes([
        {
          id: 1,
          text: "Welcome to your notes!",
          taskId: "",
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          text: "Try editing this note.",
          taskId: "",
          createdAt: new Date().toISOString(),
        },
      ]);
      if (newSession) {
        setHasStartedFocus(false);
      }
      setNewSession(false);
      hasLoggedStart.current = false;
    }
  }, [
    newSession,
    initialSession,
    setSessionData,
    reset,
    setSessionHistory,
    setTodos,
    setNotes,
  ]);

  const handleSaveToBackend = useCallback(async () => {
    if (!sessionData || !sessionData.sessionId) return;
    if (!hasStartedFocus) return;
    const { sessionId, ...sessionDetails } = sessionData;
    const uniqueHistory = Array.from(
      new Map(sessionHistory.map((item) => [item.completedAt, item])).values()
    );
    const payload = {
      sessionId: sessionData.sessionId,

      session: {
        ...sessionDetails,
        title: sessionTitle,
      },

      userSettings: {
        totalFocusDuration,
        breakDuration,
        autoStartBreaks,
        breaksNumber,
      },
      userData: { todos, notes },
      sessionFeedback: sessionReview,
      history: uniqueHistory.length ? uniqueHistory : undefined,
    };
    try {
      await sessionService.saveSession(payload);
      console.log(payload);
    } catch (error) {
      console.error("Session save error: ", error);
    }
  }, [
    hasStartedFocus,
    user,
    sessionData,
    sessionTitle,
    totalFocusDuration,
    breakDuration,
    autoStartBreaks,
    breaksNumber,
    todos,
    notes,
    sessionHistory,
    sessionReview,
  ]);

  useEffect(() => {
    if (newSession) return;
    const loadSession = async () => {
      try {
        // console.log("Checking backend for active session...");
        const backendSession = await sessionService.getActiveSession();

        if (backendSession && !backendSession.isDone) {
          console.log(backendSession);
          setTotalFocusDuration(backendSession.userSettings.totalFocusDuration);
          setBreakDuration(backendSession.userSettings.breakDuration);
          setAutoStartBreaks(backendSession.userSettings.autoStartBreaks);
          setBreaksNumber(backendSession.userSettings.breaksNumber);

          setSessionTitle(backendSession.session.title);
          setTodos(backendSession.userData.todos || []);
          setNotes(
            backendSession.userData.notes || [
              {
                id: 1,
                text: "Welcome back!",
                group: "General",
                createdAt: new Date().toISOString(),
              },
            ]
          );
          setSessionHistory(backendSession.history || []);
          setSessionReview(
            backendSession.sessionFeedback || {
              mood: null,
              focus: null,
              distractions: "",
            }
          );

          setSessionData({
            ...backendSession,
            segments: backendSession.history,
          });
        } else {
          // console.log("No active session in backend. Creating new one.");
          const newSessionData = initialSession();
          setSessionData(newSessionData);
        }
      } catch (error) {
        // console.error(
        //   "Failed to fetch active session, creating new one:",
        //   error
        // );
        setSessionData(initialSession());
      } finally {
        setIsLoading(false);
      }
    };
    loadSession();
  }, []);

  const savedCallback = useRef();
  useEffect(() => {
    savedCallback.current = handleSaveToBackend;
  }, [handleSaveToBackend]);

  useEffect(() => {
    if (isStarted && currentSegmentIndex === 0 && !hasLoggedStart.current) {
      // handleSaveToBackend();
      hasLoggedStart.current = true;
    }
  }, [isStarted, currentSegmentIndex]);

  useEffect(() => {
    if (sessionData?.isDone || currentSegmentIndex > 0) {
      if (savedCallback.current) savedCallback.current();
    }
  }, [currentSegmentIndex, sessionData?.isDone]);

  useEffect(() => {
    let intervalId = null;
    if (isStarted) {
      const fiveMinutes = 5 * 60 * 1000;
      intervalId = setInterval(() => {
        if (savedCallback.current) savedCallback.current();
      }, fiveMinutes);
    }
    return () => clearInterval(intervalId);
  }, [isStarted]);

  const handleFinalSaveAndStartNew = useCallback(async () => {
    if (savedCallback.current) {
      await savedCallback.current();
    }
    setNewSession(true);
  }, []);

  const handleReviewUpdate = useCallback(
    (field, value) => {
      setSessionReview((prev) => ({ ...prev, [field]: value }));
    },
    [setSessionReview]
  );
  const handleDistractionToggle = useCallback(
    (distraction) => {
      setSessionReview((prev) => {
        const currentDistractions = (prev.distractions || "")
          .split(",")
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean);

        const distractionLower = distraction.toLowerCase();
        let newDistractions;
        if (currentDistractions.includes(distractionLower)) {
          newDistractions = currentDistractions
            .filter((d) => d !== distractionLower)
            .join(", ");
        } else {
          newDistractions = [...currentDistractions, distraction].join(", ");
        }
        return { ...prev, distractions: newDistractions };
      });
    },
    [setSessionReview]
  );

  const handleAddTodo = useCallback(() => {
    if (!newTodo.trim()) return;
    setTodos((t) => [
      ...t,
      {
        id: Date.now(),
        text: newTodo.trim(),
        status: "Not Started",
        createdAt: new Date().toISOString(),
      },
    ]);
    setNewTodo("");
  }, [newTodo, setTodos]);

  const handleUpdateTodoStatus = useCallback(
    (id, status) =>
      setTodos((t) => t.map((x) => (x.id === id ? { ...x, status } : x))),
    [setTodos]
  );

  const handleDeleteTodo = useCallback(
    (id) => setTodos((t) => t.filter((x) => x.id !== id)),
    [setTodos]
  );

  const handlePanelToggle = (panelName) => {
    setActivePanel((current) => (current === panelName ? null : panelName));
  };

  const handleClearHistory = useCallback(() => {
    setSessionHistory([]);
    toast.success("Session history has been cleared.");
  }, [setSessionHistory]);

  if (isLoading) {
    return (
      <div className="pt-23 lg:pt-2 min-h-screen flex flex-col p-4 relative theme-transition bg-background-color justify-center items-center">
        <div className="h-8 w-3/4 rounded bg-gray-700 animate-pulse"></div>
        <div className="h-8 w-1/2 rounded bg-gray-700 animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="pt-23 lg:pt-2 min-h-screen flex flex-col p-4 relative theme-transition bg-background-color">
      <div className="w-full mb-6 relative z-10 fade-in flex justify-end gap-2">
        <button
          onClick={() => setShowQuotes((s) => !s)}
          className="flex items-center gap-2 px-3 py-1 rounded-lg bg-button-secondary text-button-secondary-text hover:bg-button-secondary-hover transition-colors"
          title="Get motivated"
        >
          <Quote className="w-5 h-5" />
          <span className="text-sm">Inspire Me</span>
        </button>

        {[
          { icon: List, key: "progress" },
          { icon: NotebookPen, key: "notes" },
          { icon: ListTodo, key: "todos" },
          { icon: SettingsIcon, key: "settings" },
        ].map(({ icon: Icon, key }) => (
          <button
            key={key}
            onClick={() => {
              if (isStarted || key === "settings") {
                handlePanelToggle(key);
              }
            }}
            className={`p-3 rounded-xl shadow-md transition-all duration-300 border border-card-border ${
              activePanel === key
                ? "bg-button-primary text-button-primary-text"
                : "bg-card-background text-text-primary"
            } ${
              !isStarted && key !== "settings"
                ? "opacity-50 cursor-not-allowed"
                : ""
            }`}
            aria-label={`Toggle ${key}`}
          >
            <Icon className="w-5 h-5" />
          </button>
        ))}
      </div>

      <div className="flex justify-center items-center flex-grow">
        <Settings
          breakDuration={breakDuration}
          setBreakDuration={setBreakDuration}
          autoStartBreaks={autoStartBreaks}
          setAutoStartBreaks={setAutoStartBreaks}
          totalBreaks={breaksNumber}
          setTotalBreaks={setBreaksNumber}
          onClearHistory={handleClearHistory}
          show={activePanel === "settings"}
          onClose={() => setActivePanel(null)}
        />

        <div className="flex flex-col items-center gap-10 lg:flex-row mt-2 lg:mt-10 transition-all duration-500 ease-in-out">
          {sessionData?.isDone ? (
            <SessionReview
              reviewData={sessionReview}
              onUpdate={handleReviewUpdate}
              onDistractionToggle={handleDistractionToggle}
              onNewSession={handleFinalSaveAndStartNew}
            />
          ) : (
            <Timer
              timeLeft={timeLeft}
              isStarted={isStarted}
              start={start}
              pause={pause}
              reset={reset}
              isBreak={currentSegment?.type === "break"}
              sessionTitle={sessionTitle}
              setSessionTitle={setSessionTitle}
              setTotalFocusDuration={setTotalFocusDuration}
              totalFocusDuration={totalFocusDuration}
              breaksLeft={
                sessionData.segments.filter(
                  (s) => s.type === "break" && !s.completedAt
                ).length
              }
              currentSegmentData={currentSegment}
              currentSegmentIndex={currentSegmentIndex}
              totalSegments={sessionData.segments.length}
              totalfocusSegments={
                sessionData.segments.filter((s) => s.type === "focus").length
              }
              totalbreakSegments={
                sessionData.segments.filter((s) => s.type === "break").length
              }
              foucsSegments={
                sessionData.segments.filter(
                  (s) => s.type === "focus" && !s.completedAt
                ).length
              }
              onSegmentUpdate={(x) => updateSegment(currentSegmentIndex, x)}
              setNewSession={() => setNewSession(true)}
              isDone={
                !(
                  sessionData?.segments[currentSegmentIndex]?.completedAt ===
                  null
                )
              }
              onUpdateBackend={handleSaveToBackend}
            />
          )}

          <CurrentProgress
            todos={todos}
            show={activePanel === "progress"}
            onClose={() => setActivePanel(null)}
          />
          <Notes
            notes={notes}
            todos={todos}
            setNotes={setNotes}
            show={activePanel === "notes"}
            onClose={() => setActivePanel(null)}
          />
        </div>

        <TodoList
          todos={todos}
          newTodo={newTodo}
          setNewTodo={setNewTodo}
          onAddTodo={handleAddTodo}
          onUpdateStatus={handleUpdateTodoStatus}
          onDeleteTodo={handleDeleteTodo}
          show={activePanel === "todos"}
          onClose={() => setActivePanel(null)}
        />
      </div>

      <AnimatePresence>
        {showQuotes && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="flex flex-row justify-around transition-all duration-300"
          >
            <MotivationalQuotes
              show={showQuotes}
              onClose={() => setShowQuotes(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FocusSession;
