import { useRef, useState } from "react";

export function usePlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const startTime = useRef<number>(0);
  const pauseTime = useRef<number>(0);
  const audioBuffer = useRef<AudioBuffer | null>(null);

  async function play(stream: ReadableStream, callback: () => void) {
    stop();
    audioContext.current = new AudioContext({ sampleRate: 24000 });
    startTime.current = audioContext.current.currentTime;

    let nextStartTime = audioContext.current.currentTime;
    const reader = stream.getReader();
    let leftover = new Uint8Array();
    let result = await reader.read();
    setIsPlaying(true);
    setIsPaused(false);

    while (!result.done && audioContext.current) {
      const data = new Uint8Array(leftover.length + result.value.length);
      data.set(leftover);
      data.set(result.value, leftover.length);

      const length = Math.floor(data.length / 4) * 4;
      const remainder = data.length % 4;
      const buffer = new Float32Array(data.buffer, 0, length / 4);

      leftover = new Uint8Array(data.buffer, length, remainder);

      audioBuffer.current = audioContext.current.createBuffer(
        1,
        buffer.length,
        audioContext.current.sampleRate
      );
      audioBuffer.current.copyToChannel(buffer, 0);

      source.current = audioContext.current.createBufferSource();
      source.current.buffer = audioBuffer.current;
      source.current.connect(audioContext.current.destination);
      source.current.start(nextStartTime);

      nextStartTime += audioBuffer.current.duration;

      result = await reader.read();
      if (result.done) {
        source.current.onended = () => {
          stop();
          callback();
        };
      }
    }
  }

  function pause() {
    if (audioContext.current && source.current) {
      pauseTime.current = audioContext.current.currentTime;
      audioContext.current.suspend();
      setIsPaused(true);
      setIsPlaying(false);
    }
  }

  function resume() {
    if (audioContext.current) {
      audioContext.current.resume();
      setIsPaused(false);
      setIsPlaying(true);
    }
  }

  function stop() {
    audioContext.current?.close();
    audioContext.current = null;
    setIsPlaying(false);
    setIsPaused(false);
  }

  return {
    isPlaying,
    isPaused,
    play,
    pause,
    resume,
    stop,
  };
}