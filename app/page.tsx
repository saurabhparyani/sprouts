"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  EnterIcon,
  LoadingIcon,
  MicrophoneIcon,
  PauseIcon,
  StopIcon,
} from "@/lib/icons";
import { usePlayer } from "@/lib/usePlayer";
import { track } from "@vercel/analytics";
import { useMicVAD, utils } from "@ricky0123/vad-react";
import Link from "next/link";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type InterviewStage = "welcome" | "job-description" | "interview";

export default function Home() {
  const [input, setInput] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [stage, setStage] = useState<InterviewStage>("welcome");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Welcome to SproutsAI! Please paste the job description you would like to be interviewed for, and I will conduct a professional interview based on the requirements.",
    },
  ]);

  const [isPending, setIsPending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const player = usePlayer();

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = async (input: string | Blob) => {
    setIsPending(true);
    const formData = new FormData();

    if (input instanceof Blob) {
      formData.append("input", input, "audio.wav");
      track("Speech input");
    } else {
      formData.append("input", input);
      track("Text input");
    }

    for (const message of messages) {
      formData.append("message", JSON.stringify(message));
    }

    try {
      const response = await fetch("/api", {
        method: "POST",
        body: formData,
      });

      const transcript = decodeURIComponent(
        response.headers.get("X-Transcript") || ""
      );
      const text = decodeURIComponent(response.headers.get("X-Response") || "");

      if (!response.ok || !transcript || !text || !response.body) {
        if (response.status === 429) {
          toast.error("Too many requests. Please try again later.");
        } else {
          toast.error((await response.text()) || "An error occurred.");
        }
        return;
      }

      if (response.body) {
        player.play(response.body, () => {
          const isFirefox = navigator.userAgent.includes("Firefox");
          if (isFirefox) vad.start();
        });
      }
      setInput(transcript);

      if (stage === "welcome" && typeof input === "string") {
        setStage("interview");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: transcript,
        },
        {
          role: "assistant",
          content: text,
        },
      ]);
    } catch (error) {
      toast.error("An error occurred while processing your request.");
    } finally {
      setIsPending(false);
    }
  };

  const vad = useMicVAD({
    startOnLoad: false,
    onSpeechEnd: (audio) => {
      setIsRecording(false);
      player.stop();
      const wav = utils.encodeWAV(audio);
      const blob = new Blob([wav], { type: "audio/wav" });
      handleSubmit(blob);
      const isFirefox = navigator.userAgent.includes("Firefox");
      if (isFirefox) vad.pause();
    },
    workletURL: "/vad.worklet.bundle.min.js",
    modelURL: "/silero_vad.onnx",
    positiveSpeechThreshold: 0.6,
    minSpeechFrames: 4,
    ortConfig(ort) {
      const isSafari = /^((?!chrome|android).)*safari/i.test(
        navigator.userAgent
      );

      ort.env.wasm = {
        wasmPaths: {
          "ort-wasm-simd-threaded.wasm": "/ort-wasm-simd-threaded.wasm",
          "ort-wasm-simd.wasm": "/ort-wasm-simd.wasm",
          "ort-wasm.wasm": "/ort-wasm.wasm",
          "ort-wasm-threaded.wasm": "/ort-wasm-threaded.wasm",
        },
        numThreads: isSafari ? 1 : 4,
      };
    },
  });

  const handleJobDescriptionSubmit = () => {
    if (!jobDescription.trim()) {
      toast.error("Please enter a job description");
      return;
    }
    handleSubmit(jobDescription);
  };

  const startRecording = () => {
    setIsRecording(true);
    vad.start();
    player.stop();
  };

  const stopRecording = () => {
    setIsRecording(false);
    vad.pause();
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-8">
      <header className="text-center">
        <Link href="/">
          <h1 className="text-4xl font-bold mb-2">SproutsAI</h1>
        </Link>
        <p className="text-neutral-600 dark:text-neutral-400">
          AI-Interviewer powered by{" "}
          <Link href="https://saurabhparyani.dev" target="_blank">
            <span className="underline underline-offset-4 hover:text-indigo-600 dark:hover:text-indigo-400">
              Saurabh Paryani
            </span>
          </Link>
        </p>
      </header>

      {stage === "welcome" && (
        <div className="bg-neutral-100 dark:bg-neutral-900 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-3">Job Description</h2>
          <textarea
            ref={inputRef as React.LegacyRef<HTMLTextAreaElement>}
            className="w-full h-32 p-3 rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
            placeholder="Paste the job description here..."
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
          />
          <button
            onClick={handleJobDescriptionSubmit}
            className="mt-3 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded flex items-center gap-2"
            disabled={isPending}
          >
            {isPending ? (
              <>
                <LoadingIcon /> Processing...
              </>
            ) : (
              <>
                <EnterIcon /> Start Interview
              </>
            )}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 flex-1">
        {messages.map((message, i) => (
          <div
            key={i}
            className={clsx("p-4 rounded-lg", {
              "bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950 dark:to-purple-950":
                message.role === "assistant",
              "bg-neutral-50 dark:bg-neutral-950": message.role === "user",
            })}
          >
            <div className="font-medium mb-1">
              {message.role === "assistant" ? "SproutsAI" : "You"}
            </div>
            <div className="flex justify-between items-start gap-4">
              <div>{message.content}</div>
            </div>
          </div>
        ))}
      </div>

      {stage === "interview" && (
        <div className="sticky bottom-0 bg-white dark:bg-black p-4">
          <div className="flex gap-4 items-center">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={clsx(
                "p-4 rounded-full transition-colors",
                isRecording
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
              )}
              disabled={vad.loading || isPending}
            >
              {isPending ? (
                <LoadingIcon />
              ) : (
                <MicrophoneIcon className="text-white" />
              )}
            </button>

            {player.isPlaying || player.isPaused ? (
              <button
                onClick={player.isPaused ? player.resume : player.pause}
                className="p-4 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transition-colors"
              >
                {player.isPaused ? (
                  <StopIcon className="text-white" />
                ) : (
                  <PauseIcon className="text-white" />
                )}
              </button>
            ) : null}

            <div className="flex-1 text-sm text-neutral-500">
              {vad.loading
                ? "Loading speech detection..."
                : isRecording
                ? "Recording... Click to stop"
                : "Click to start speaking"}
            </div>
          </div>
        </div>
      )}

      <div
        className={clsx(
          "absolute size-36 blur-3xl rounded-full bg-gradient-to-b from-indigo-200 via-purple-200 to-pink-200 dark:from-indigo-600 dark:via-purple-600 dark:to-pink-600 -z-50 transition ease-in-out",
          {
            "opacity-0": vad.loading || vad.errored,
            "opacity-30": !vad.loading && !vad.errored && !vad.userSpeaking,
            "opacity-100 scale-110": vad.userSpeaking,
          }
        )}
      />
    </div>
  );
}
