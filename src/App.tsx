import React, { useState, useEffect, useRef } from "react";
import { 
  Music, 
  Video, 
  Volume2, 
  Download, 
  Settings, 
  DollarSign, 
  Globe, 
  FileText, 
  Check, 
  AlertCircle, 
  Sparkles, 
  BookOpen, 
  ArrowRight, 
  TrendingUp, 
  Info,
  Layers,
  FileAudio,
  ShieldCheck,
  Zap,
  HelpCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// --- Types ---
interface AdSenseConfig {
  publisherId: string;
  slotTop: string;
  slotResult: string;
  slotSidebar: string;
  enabled: boolean;
}

const DEFAULT_ADSENSE: AdSenseConfig = {
  publisherId: "ca-pub-2484423746725349", // 연동된 구글 애드센스 게시자 ID
  slotTop: "8472935213",     // 상단 기본형 광고 슬롯 예시 ID (필요시 교체 가능)
  slotResult: "2837492104",  // 변환 완료창 네이티브형 광고 슬롯 예시 ID
  slotSidebar: "",
  enabled: true,             // 기본적으로 애드센스 연동 상태를 활성화합니다.
};

declare global {
  interface Window {
    lamejs?: any;
    webkitAudioContext?: typeof AudioContext;
    adsbygoogle?: any[];
  }
}

export default function App() {
  // --- States ---
  const [activeTab, setActiveTab] = useState<"converter" | "adsense" | "guide" | "privacy">("converter");
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<{ duration: number; size: number } | null>(null);
  const [bitrate, setBitrate] = useState<number>(192);
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>("00:00");
  const [totalTimeStr, setTotalTimeStr] = useState<string>("00:00");
  const [vuLevels, setVuLevels] = useState<number[]>(new Array(24).fill(6));
  const [convertedAudioUrl, setConvertedAudioUrl] = useState<string | null>(null);
  const [convertedFileName, setConvertedFileName] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // AdSense Settings State
  const [adsenseConfig, setAdsenseConfig] = useState<AdSenseConfig>(DEFAULT_ADSENSE);
  const [isSettingsSaved, setIsSettingsSaved] = useState<boolean>(false);

  // References
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const dragOverRef = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = dragOverRef;

  // --- Effects ---
  // Load AdSense Settings on Init
  useEffect(() => {
    const saved = localStorage.getItem("reel_to_mp3_adsense_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setAdsenseConfig(parsed);
      } catch (e) {
        console.error("AdSense 설정을 로드하는 중 오류가 발생했습니다.", e);
      }
    }
  }, []);

  // Sync Google AdSense Tag loading
  useEffect(() => {
    if (adsenseConfig.enabled && adsenseConfig.publisherId) {
      try {
        const adsbygoogle = window.adsbygoogle || [];
        // Trigger AdSense code refresh
        if (typeof window !== "undefined" && adsbygoogle) {
          setTimeout(() => {
            try {
              (window.adsbygoogle = window.adsbygoogle || []).push({});
            } catch (err) {
              // Ignore initial push errors in local sandbox environments
              console.log("AdSense push initialization note:", err);
            }
          }, 300);
        }
      } catch (err) {
        console.error(err);
      }
    }
  }, [adsenseConfig.enabled, adsenseConfig.publisherId, activeTab]);

  // Clean up Object URL
  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  // --- Helpers ---
  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return "00:00";
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // --- Core Processing Logic ---
  const handleFileChange = (file: File) => {
    setErrorMessage(null);
    setConvertedAudioUrl(null);
    
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setErrorMessage("동영상 파일만 업로드할 수 있습니다. (MP4, MOV, WEBM, MKV 등)");
      return;
    }

    setCurrentFile(file);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);

    // Create a temporary video element to read metadata
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = url;
    probe.onloadedmetadata = () => {
      setFileMeta({
        duration: probe.duration,
        size: file.size,
      });
      setTotalTimeStr(formatTime(probe.duration));
    };
    probe.onerror = () => {
      setFileMeta({
        duration: 0,
        size: file.size,
      });
      setErrorMessage("영상의 메타데이터를 파악할 수 없습니다. 계속 변환을 시도할 수는 있습니다.");
    };
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileChange(file);
    }
  };

  const floatTo16BitPCM = (input: Float32Array) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  };

  const cancelConversion = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    cleanupAudioNodes();
    setIsConverting(false);
    setProgress(0);
    setVuLevels(new Array(24).fill(6));
  };

  const cleanupAudioNodes = () => {
    try { processorNodeRef.current?.disconnect(); } catch (e) {}
    try { mediaSourceRef.current?.disconnect(); } catch (e) {}
    try { gainNodeRef.current?.disconnect(); } catch (e) {}
    try { audioContextRef.current?.close(); } catch (e) {}
    
    processorNodeRef.current = null;
    mediaSourceRef.current = null;
    gainNodeRef.current = null;
    audioContextRef.current = null;
  };

  const startConversion = () => {
    if (!currentFile || !objectUrl) return;
    setErrorMessage(null);
    setConvertedAudioUrl(null);
    setIsConverting(true);
    setProgress(0);

    const lamejs = window.lamejs;
    if (!lamejs) {
      setErrorMessage("MP3 변환 라이브러리(LameJS)가 아직 준비되지 않았습니다. 잠시만 기다린 후 다시 시도해 주세요.");
      setIsConverting(false);
      return;
    }

    // Initialize Video Player for background processing
    const video = document.createElement("video");
    video.src = objectUrl;
    video.muted = false; // Must set to false to feed audio to context
    video.volume = 1;
    videoRef.current = video;

    video.onloadedmetadata = () => {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
          throw new Error("이 브라우저는 Web Audio API를 지원하지 않습니다.");
        }

        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaElementSource(video);
        mediaSourceRef.current = source;

        const channels = 2;
        const bufferSize = 4096;
        
        // Use ScriptProcessor for step-by-step raw buffer extraction
        const processor = audioCtx.createScriptProcessor(bufferSize, channels, channels);
        processorNodeRef.current = processor;

        const silentGain = audioCtx.createGain();
        silentGain.gain.value = 0.05; // Play soft ambient preview to user
        gainNodeRef.current = silentGain;

        source.channelCount = 2;
        source.channelCountMode = "explicit";
        source.channelInterpretation = "speakers";

        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(audioCtx.destination);

        // Initialize lamejs MP3 Encoder
        const mp3Encoder = new lamejs.Mp3Encoder(channels, audioCtx.sampleRate, bitrate);
        const mp3Data: any[] = [];

        processor.onaudioprocess = (e) => {
          const left = e.inputBuffer.getChannelData(0);
          const right = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : left;

          // Compute VU levels based on average amplitude
          let sum = 0;
          for (let i = 0; i < left.length; i += 16) {
            sum += Math.abs(left[i]);
          }
          const avg = sum / (left.length / 16);
          
          // Generate 24 channels of animated VU levels
          const newVu = Array.from({ length: 24 }).map((_, i) => {
            const jitter = Math.random() * 0.3;
            const h = Math.max(6, Math.min(100, (avg + jitter) * 110 * (0.5 + Math.sin(i / 3) * 0.4)));
            return h;
          });
          setVuLevels(newVu);

          // Convert Floating points of web audio to Int16 PCM
          const left16 = floatTo16BitPCM(left);
          const right16 = floatTo16BitPCM(right);

          const mp3Buf = mp3Encoder.encodeBuffer(left16, right16);
          if (mp3Buf.length > 0) {
            mp3Data.push(mp3Buf);
          }

          // Update progression and timing UI
          const current = video.currentTime;
          const duration = video.duration || fileMeta?.duration || 1;
          const pct = Math.min(99, (current / duration) * 100);
          
          setProgress(pct);
          setCurrentTimeStr(formatTime(current));
        };

        const finishEncoding = () => {
          try {
            cleanupAudioNodes();
            const endBuf = mp3Encoder.flush();
            if (endBuf.length > 0) {
              mp3Data.push(endBuf);
            }

            const blob = new Blob(mp3Data, { type: "audio/mp3" });
            const audioUrl = URL.createObjectURL(blob);
            const originalName = currentFile.name.replace(/\.[^/.]+$/, "");
            const outName = `${originalName}_[REEL_TO_MP3].mp3`;

            setConvertedFileName(outName);
            setConvertedAudioUrl(audioUrl);
            setIsConverting(false);
            setProgress(100);
            setVuLevels(new Array(24).fill(6));
          } catch (err: any) {
            setErrorMessage(`인코딩 완성 중 오류가 발생했습니다: ${err.message}`);
            setIsConverting(false);
          }
        };

        video.addEventListener("ended", finishEncoding);
        video.play().catch((err) => {
          setErrorMessage("영상 오디오 트랙을 수신하는 과정에서 사용자 인터랙션이 필요하거나 디코딩 에러가 발생했습니다.");
          setIsConverting(false);
          cleanupAudioNodes();
        });

      } catch (err: any) {
        setErrorMessage(`오디오 트랙 분석을 초기화하지 못했습니다: ${err.message}`);
        setIsConverting(false);
        cleanupAudioNodes();
      }
    };

    video.onerror = () => {
      setErrorMessage("영상을 불러오는 도중 오류가 발생했습니다.");
      setIsConverting(false);
    };
  };

  // --- AdSense Settings Handling ---
  const handleAdSenseSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("reel_to_mp3_adsense_settings", JSON.stringify(adsenseConfig));
    setIsSettingsSaved(true);
    setTimeout(() => setIsSettingsSaved(false), 3000);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-between py-6 px-4 md:px-8 max-w-6xl mx-auto w-full font-sans selection:bg-amber-500 selection:text-black">
      
      {/* HEADER SECTION */}
      <header className="w-full max-w-3xl flex items-center justify-between border-b border-zinc-800 pb-5 mb-8" id="appHeader">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-amber-600 to-amber-400 rounded-xl glow-amber">
            <Music className="w-6 h-6 text-zinc-950 font-bold" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
              REEL <span className="text-amber-500 text-lg">→</span> MP3
            </h1>
            <p className="text-xs text-zinc-400 font-mono tracking-wider uppercase">Local Studio Platform</p>
          </div>
        </div>

        {/* Dynamic Navigation */}
        <nav className="flex items-center gap-1.5">
          <button 
            id="navConverter"
            onClick={() => setActiveTab("converter")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer ${
              activeTab === "converter" 
                ? "bg-zinc-800 text-white border border-zinc-700" 
                : "text-zinc-400 hover:text-white hover:bg-zinc-900"
            }`}
          >
            변환기
          </button>
          <button 
            id="navAdSense"
            onClick={() => setActiveTab("adsense")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1 cursor-pointer ${
              activeTab === "adsense" 
                ? "bg-amber-950/40 text-amber-400 border border-amber-900/50" 
                : "text-zinc-400 hover:text-white hover:bg-zinc-900"
            }`}
          >
            <DollarSign className="w-3 h-3" />
            수익화 설정
          </button>
          <button 
            id="navGuide"
            onClick={() => setActiveTab("guide")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1 cursor-pointer ${
              activeTab === "guide" 
                ? "bg-zinc-800 text-white border border-zinc-700" 
                : "text-zinc-400 hover:text-white hover:bg-zinc-900"
            }`}
          >
            <Globe className="w-3 h-3" />
            배포&가이드
          </button>
          <button 
            id="navPrivacy"
            onClick={() => setActiveTab("privacy")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1 cursor-pointer ${
              activeTab === "privacy" 
                ? "bg-zinc-800 text-white border border-zinc-700" 
                : "text-zinc-400 hover:text-white hover:bg-zinc-900"
            }`}
          >
            <FileText className="w-3 h-3" />
            약관&필수서류
          </button>
        </nav>
      </header>

      {/* ADSENSE TOP BANNER PLACEHOLDER / ACTUAL */}
      <div className="w-full max-w-3xl mb-6">
        {adsenseConfig.enabled && adsenseConfig.publisherId && adsenseConfig.slotTop ? (
          <div className="w-full bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-2 flex items-center justify-center overflow-hidden min-h-[90px]">
            <ins 
              className="adsbygoogle"
              style={{ display: "block", width: "100%", height: "90px" }}
              data-ad-client={adsenseConfig.publisherId}
              data-ad-slot={adsenseConfig.slotTop}
              data-ad-format="horizontal"
              data-full-width-responsive="true"
            ></ins>
          </div>
        ) : (
          <div className="w-full h-[90px] border border-dashed border-zinc-800 bg-zinc-900/30 rounded-xl flex flex-col items-center justify-center text-zinc-500 font-mono text-[11px] p-4 relative overflow-hidden group">
            <span className="absolute top-2 left-3 text-[9px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">AD PREVIEW</span>
            <span className="font-semibold text-zinc-400 flex items-center gap-1">
              구글 애드센스 - 상단 가로형 배너 영역 [728x90]
            </span>
            <span className="text-zinc-600 mt-1">
              수익화 설정 탭에서 애드센스를 활성화하면 실제 광고로 연동됩니다.
            </span>
          </div>
        )}
      </div>

      {/* MAIN LAYOUT */}
      <main className="w-full max-w-3xl flex-1 flex flex-col gap-6" id="appMain">
        <AnimatePresence mode="wait">
          
          {/* TAB 1: CONVERTER */}
          {activeTab === "converter" && (
            <motion.section
              key="converter"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-6"
              id="sectionConverter"
            >
              {/* Card Container */}
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 md:p-8 backdrop-blur-md relative overflow-hidden shadow-2xl">
                
                {/* Background glow effects */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-zinc-500/5 rounded-full blur-3xl pointer-events-none" />

                <div className="mb-6">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    오디오 초고속 로컬 추출
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    동영상 오디오 음원을 기기 내부에서 직접 추출하여 MP3로 변환합니다. 파일은 절대 서버에 보관되거나 전송되지 않습니다.
                  </p>
                </div>

                {/* DROP ZONE */}
                <div 
                  id="dropzone"
                  onDragOver={handleAdSenseSave} // prevent default helper
                  onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 relative group flex flex-col items-center justify-center min-h-[180px] ${
                    isDragOver 
                      ? "border-amber-500 bg-amber-950/10" 
                      : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-950/60"
                  }`}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                    accept="video/*"
                    className="hidden" 
                  />
                  
                  <div className="w-14 h-14 bg-zinc-900 rounded-2xl flex items-center justify-center border border-zinc-800 mb-4 group-hover:scale-105 transition-transform duration-300">
                    <Video className="w-6 h-6 text-zinc-400 group-hover:text-amber-400 transition-colors duration-300" />
                  </div>

                  <p className="text-sm font-semibold text-zinc-200">
                    영상을 끌어다 놓거나 클릭하여 선택하세요
                  </p>
                  <p className="text-xs text-zinc-500 mt-2 font-mono">
                    MP4, MOV, WEBM, MKV, AVI 등 지원 (최대 1GB)
                  </p>
                </div>

                {/* FILE LABEL METADATA */}
                {currentFile && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-5 p-4 bg-zinc-950/60 border border-zinc-800/80 rounded-xl flex flex-col gap-2.5 overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileAudio className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span className="text-xs font-mono font-medium text-amber-400 truncate">
                          {currentFile.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono bg-zinc-900 text-zinc-400 px-2 py-0.5 rounded border border-zinc-800 flex-shrink-0">
                        {currentFile.type.split("/")[1]?.toUpperCase() || "VIDEO"}
                      </span>
                    </div>

                    <div className="flex gap-4 border-t border-zinc-900 pt-2 text-[11px] font-mono text-zinc-400">
                      <div>
                        크기: <span className="text-zinc-200">{fileMeta ? formatSize(fileMeta.size) : formatSize(currentFile.size)}</span>
                      </div>
                      <div>
                        길이: <span className="text-zinc-200">{fileMeta ? formatTime(fileMeta.duration) : "분석 중..."}</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ERROR BOX */}
                {errorMessage && (
                  <div className="mt-4 p-3.5 bg-red-950/20 border border-red-900/50 rounded-xl flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-red-200/90 leading-relaxed font-sans">{errorMessage}</span>
                  </div>
                )}

                {/* CONTROLS AREA */}
                <div className="flex flex-col sm:flex-row items-center gap-3 mt-6 pt-6 border-t border-zinc-850">
                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <span className="text-xs text-zinc-400 font-medium whitespace-nowrap">추출 음질:</span>
                    <select 
                      id="bitrateSelector"
                      value={bitrate}
                      onChange={(e) => setBitrate(Number(e.target.value))}
                      disabled={isConverting}
                      className="w-full sm:w-auto bg-zinc-950 text-xs font-mono text-zinc-300 border border-zinc-800 rounded-lg py-2.5 px-3 focus:outline-none focus:border-amber-500 cursor-pointer disabled:opacity-50"
                    >
                      <option value={128}>128 kbps (보통 음질)</option>
                      <option value={192}>192 kbps (고음질 - 추천)</option>
                      <option value={320}>320 kbps (스튜디오 고음질)</option>
                    </select>
                  </div>

                  <button
                    id="actionConvertBtn"
                    onClick={isConverting ? cancelConversion : startConversion}
                    disabled={!currentFile}
                    className={`w-full sm:flex-1 py-2.5 px-5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 ${
                      !currentFile 
                        ? "bg-zinc-800 text-zinc-500 border border-zinc-850 cursor-not-allowed" 
                        : isConverting 
                          ? "bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20"
                          : "bg-amber-500 text-zinc-950 hover:bg-amber-400 hover:scale-[1.02] active:scale-[0.98] glow-amber"
                    }`}
                  >
                    {isConverting ? (
                      <>
                        <span className="animate-pulse">추출 중단하기</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        <span>MP3 오디오 추출 시작</span>
                      </>
                    )}
                  </button>
                </div>

                {/* ANIMATED CONVERTING DIAL & VU METERS */}
                {isConverting && (
                  <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 p-6 bg-zinc-950/80 border border-zinc-850 rounded-xl"
                  >
                    {/* Retro tape spin */}
                    <div className="flex justify-center gap-12 mb-5">
                      <div className="w-10 h-10 rounded-full border-2 border-dashed border-amber-500/70 animate-spin flex items-center justify-center">
                        <div className="w-3 h-3 bg-zinc-800 rounded-full" />
                      </div>
                      <div className="w-10 h-10 rounded-full border-2 border-dashed border-amber-500/70 animate-spin flex items-center justify-center">
                        <div className="w-3 h-3 bg-zinc-800 rounded-full" />
                      </div>
                    </div>

                    {/* Interactive 24-band Analog Level 이퀄라이저 */}
                    <div className="flex items-end justify-between gap-1 h-14 bg-zinc-950/90 p-2 border border-zinc-900 rounded-lg mb-4">
                      {vuLevels.map((val, idx) => (
                        <div 
                          key={idx} 
                          className="w-full rounded-sm transition-all duration-75"
                          style={{ 
                            height: `${val}%`, 
                            backgroundColor: val > 80 ? "#ef4444" : val > 55 ? "#f59e0b" : "#10b981"
                          }}
                        />
                      ))}
                    </div>

                    <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500 mb-2">
                      <span>{currentTimeStr}</span>
                      <span>{totalTimeStr}</span>
                    </div>

                    <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-amber-500 h-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    <p className="text-[10.5px] font-mono text-zinc-400 text-center mt-3 animate-pulse-slow">
                      영상을 재생하며 실시간 버퍼 디코딩을 진행하고 있습니다. 잠시 기다려 주세요.
                    </p>
                  </motion.div>
                )}

                {/* RESULT MP3 CONTROLLER */}
                {convertedAudioUrl && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-6 p-5 bg-zinc-950/90 border border-zinc-800 rounded-xl glow-green"
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">MP3 변환 완료</h3>
                    </div>

                    <div className="text-xs font-mono text-zinc-300 break-all mb-4 bg-zinc-900/60 p-3 rounded-lg border border-zinc-850">
                      {convertedFileName}
                    </div>

                    <audio 
                      src={convertedAudioUrl} 
                      controls 
                      className="w-full h-11 border border-zinc-800 rounded-lg bg-zinc-950 mb-4 focus:outline-none"
                    />

                    <a 
                      href={convertedAudioUrl}
                      download={convertedFileName}
                      className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold rounded-lg flex items-center justify-center gap-2 uppercase tracking-wide cursor-pointer transition-all duration-300 shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20"
                    >
                      <Download className="w-4 h-4" />
                      <span>고화질 MP3 파일 다운로드</span>
                    </a>
                  </motion.div>
                )}

              </div>

              {/* ADSENSE RESULT INLINE AD (CLICK ENHANCED) */}
              {convertedAudioUrl && (
                <div className="w-full">
                  {adsenseConfig.enabled && adsenseConfig.publisherId && adsenseConfig.slotResult ? (
                    <div className="w-full bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-2 flex items-center justify-center overflow-hidden min-h-[100px]">
                      <ins 
                        className="adsbygoogle"
                        style={{ display: "block", width: "100%", height: "100px" }}
                        data-ad-client={adsenseConfig.publisherId}
                        data-ad-slot={adsenseConfig.slotResult}
                        data-ad-format="fluid"
                      ></ins>
                    </div>
                  ) : (
                    <div className="w-full h-[100px] border border-dashed border-zinc-800 bg-zinc-900/30 rounded-xl flex flex-col items-center justify-center text-zinc-500 font-mono text-[11px] p-4 relative overflow-hidden">
                      <span className="absolute top-2 left-3 text-[9px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">AD PREVIEW</span>
                      <span className="font-semibold text-zinc-400 flex items-center gap-1">
                        구글 애드센스 - 다운로드 성공 영역 광고 [네이티브 / 인피드]
                      </span>
                      <span className="text-zinc-600 mt-1">
                        가장 클릭 전환율(CTR)이 높은 위치입니다. 변환이 완료되면 이 공간에 애드센스 광고가 채워집니다.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* FEATURES BENCHMARK */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-zinc-900/40 border border-zinc-850 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center border border-zinc-800 mb-3 text-amber-400">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold text-white mb-1">100% 로컬 프라이버시</h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    영상이 서버로 올라가지 않아 유출 걱정이 전혀 없으며, 네트워크 대역폭도 소모하지 않습니다.
                  </p>
                </div>

                <div className="p-4 bg-zinc-900/40 border border-zinc-850 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center border border-zinc-800 mb-3 text-amber-400">
                    <Zap className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold text-white mb-1">설치 없는 원클릭</h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    앱 설치나 플러그인 요구 없이 최신 모던 브라우저 환경(모바일, PC 등) 어디서나 켜는 즉시 작동합니다.
                  </p>
                </div>

                <div className="p-4 bg-zinc-900/40 border border-zinc-850 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center border border-zinc-800 mb-3 text-amber-400">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold text-white mb-1">순수 국산 무공해 툴</h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    복잡한 가입과 유료화 강요가 없습니다. 수익은 오직 구글 애드센스 배너 광고를 통해서만 충당합니다.
                  </p>
                </div>
              </div>

            </motion.section>
          )}

          {/* TAB 2: ADSENSE CONFIG */}
          {activeTab === "adsense" && (
            <motion.section
              key="adsense"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 md:p-8"
              id="sectionAdSense"
            >
              <div className="mb-6">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-bold text-white">구글 애드센스 수익형 연동 설정</h2>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  자신의 구글 애드센스 광고 코드를 매핑하여 이 홈페이지에서 발생하는 모든 광고 클릭 수익을 직접 가져가세요.
                </p>
              </div>

              <form onSubmit={handleAdSenseSave} className="space-y-4">
                <div className="p-4 bg-zinc-950 border border-zinc-850 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-200">애드센스 연동 여부</label>
                    <button
                      type="button"
                      onClick={() => setAdsenseConfig({ ...adsenseConfig, enabled: !adsenseConfig.enabled })}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        adsenseConfig.enabled ? "bg-amber-500" : "bg-zinc-800"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-zinc-950 shadow ring-0 transition duration-200 ease-in-out ${
                          adsenseConfig.enabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="border-t border-zinc-900 pt-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <label className="text-[11px] font-semibold text-zinc-300">구글 애드센스 게시자 ID (Publisher ID)</label>
                      <div className="group relative">
                        <Info className="w-3.5 h-3.5 text-zinc-500 cursor-pointer" />
                        <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 p-2 bg-zinc-950 border border-zinc-850 rounded text-[10px] text-zinc-400 w-48 leading-relaxed z-10">
                          구글 애드센스 대시보드 - 계정 정보에서 ca-pub-로 시작하는 16자리 숫자를 입력하세요.
                        </div>
                      </div>
                    </div>
                    <input 
                      type="text" 
                      placeholder="ca-pub-XXXXXXXXXXXXXXXX"
                      value={adsenseConfig.publisherId}
                      onChange={(e) => setAdsenseConfig({ ...adsenseConfig, publisherId: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-zinc-900 pt-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-300 mb-1.5">상단 배너 광고 슬롯 ID</label>
                      <input 
                        type="text" 
                        placeholder="예: 1234567890"
                        value={adsenseConfig.slotTop}
                        onChange={(e) => setAdsenseConfig({ ...adsenseConfig, slotTop: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-300 mb-1.5">변환 완료 결과창 광고 슬롯 ID</label>
                      <input 
                        type="text" 
                        placeholder="예: 0987654321"
                        value={adsenseConfig.slotResult}
                        onChange={(e) => setAdsenseConfig({ ...adsenseConfig, slotResult: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <p className="text-[11px] text-zinc-500 leading-relaxed max-w-[70%]">
                    설정한 데이터는 브라우저 로컬 저장소(LocalStorage)에 기밀 보관되며, 배포 후에도 해당 기기에서 그대로 유지됩니다.
                  </p>
                  
                  <button
                    type="submit"
                    className="py-2.5 px-6 bg-amber-500 text-zinc-950 font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-amber-400 cursor-pointer flex items-center gap-1.5 transition-all duration-200"
                  >
                    {isSettingsSaved ? <Check className="w-3.5 h-3.5" /> : null}
                    <span>{isSettingsSaved ? "저장 완료" : "설정 저장하기"}</span>
                  </button>
                </div>
              </form>

              {/* EDUCATIONAL TIP SECTION FOR ADSENSE */}
              <div className="mt-6 p-4.5 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                <h3 className="text-xs font-bold text-amber-400 flex items-center gap-1.5 mb-2">
                  <TrendingUp className="w-4 h-4" />
                  수익형 사이트 운영 및 애드센스 승인 비법
                </h3>
                <ul className="space-y-2 text-[11px] text-zinc-400 leading-relaxed">
                  <li>
                    <strong className="text-zinc-200">1. 개인 도메인 연결 필수:</strong> Vercel/Netlify의 기본 도메인(.vercel.app 등)보다 개인 닷컴(.com) 또는 .co.kr 도메인을 저렴하게 구입해 연결하는 것이 승인에 훨씬 유리합니다.
                  </li>
                  <li>
                    <strong className="text-zinc-200">2. 검색 엔진 최적화(SEO) 반영 완료:</strong> 본 사이트에는 기본적으로 메타데이터, 오픈 그래프 태그가 아주 충실히 빌드되어 있습니다. 네이버 서치어드바이저 및 구글 서치콘솔에 사이트맵을 등록해보세요.
                  </li>
                  <li>
                    <strong className="text-zinc-200">3. 이용약관 및 개인정보처리방침 구비:</strong> 구글 애드센스는 프라이버시 규정이 엄격합니다. 본 웹앱의 4번째 탭에 준비된 전문을 사이트에 상시 공개하는 것만으로 심사 불합격 요인을 사전 차단합니다.
                  </li>
                </ul>
              </div>
            </motion.section>
          )}

          {/* TAB 3: GUIDE & DEPLOYMENT */}
          {activeTab === "guide" && (
            <motion.section
              key="guide"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 md:p-8"
              id="sectionGuide"
            >
              <div className="mb-6">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-bold text-white">무료 사이트 배포 및 호스팅 가이드</h2>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  작성 완료된 이 리액트 소스코드는 정적 파일(HTML/JS/CSS)로 빌드되므로, 누구나 평생 무료로 배포하고 도메인을 연결할 수 있습니다.
                </p>
              </div>

              <div className="space-y-6">
                
                {/* Deployment 1: Netlify */}
                <div className="p-4 bg-zinc-950 border border-zinc-850 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                      <span className="w-5 h-5 bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400 rounded-full flex items-center justify-center font-mono">1</span>
                      Netlify를 이용한 간편 배포 (추천)
                    </h3>
                    <span className="text-[10px] font-mono bg-teal-950 text-teal-400 border border-teal-900/50 px-2 py-0.5 rounded">평생 무료</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed mb-3">
                    가장 간편하고 복잡한 서버 터미널 없이 드래그 앤 드롭만으로 즉시 전세계 라이브 배포가 가능합니다.
                  </p>
                  <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-850 font-mono text-[10px] text-zinc-300 leading-relaxed space-y-1">
                    <p>1. 이 AI 스튜디오 프로젝트를 완료하고 우측 상단 <strong className="text-amber-500">Settings &gt; Export Zip</strong>을 다운로드 받습니다.</p>
                    <p>2. 다운로드한 ZIP의 압축을 해제하고 폴더에서 <code className="bg-zinc-950 px-1 rounded">npm install</code> 및 <code className="bg-zinc-950 px-1 rounded">npm run build</code>를 실행해 <code className="text-emerald-400 font-bold">dist</code> 폴더를 만듭니다.</p>
                    <p>3. <a href="https://www.netlify.com" target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">Netlify</a>에 회원가입 후, 대시보드의 "Drag and drop your site folder" 영역에 생성된 <strong className="text-zinc-100">dist</strong> 폴더만 통째로 드래그 앤 드롭 하시면 즉시 주소가 발급됩니다!</p>
                  </div>
                </div>

                {/* Deployment 2: Vercel */}
                <div className="p-4 bg-zinc-950 border border-zinc-850 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                      <span className="w-5 h-5 bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400 rounded-full flex items-center justify-center font-mono">2</span>
                      GitHub 연동을 이용한 Vercel 자동화 배포
                    </h3>
                    <span className="text-[10px] font-mono bg-purple-950 text-purple-400 border border-purple-900/50 px-2 py-0.5 rounded">CI/CD 자동</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed mb-3">
                    깃허브(GitHub)와 연결해두면 소스코드를 수정해서 푸시할 때마다 주소가 자동으로 실시간 빌드 업데이트됩니다.
                  </p>
                  <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-850 font-mono text-[10px] text-zinc-300 leading-relaxed space-y-1">
                    <p>1. 우측 상단 <strong className="text-amber-500">Settings &gt; Export to GitHub</strong>을 클릭해 소스를 본인 저장소로 내보냅니다.</p>
                    <p>2. <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">Vercel</a> 대시보드에서 'Add New Project'를 선택하고 해당 깃허브 레포지토리를 가져옵니다.</p>
                    <p>3. 빌드 세팅은 기본(Vite / Framework Preset)으로 두고 'Deploy'만 누르면 자동으로 완료됩니다.</p>
                  </div>
                </div>

                {/* FAQ */}
                <div className="p-4 bg-zinc-900 border border-zinc-850 rounded-xl">
                  <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1">
                    <HelpCircle className="w-4 h-4 text-amber-400" />
                    수익 극대화를 위한 부트스트래핑 질문답변
                  </h4>
                  <div className="space-y-3 text-[11px] leading-relaxed">
                    <div>
                      <p className="font-semibold text-zinc-200">Q. 모바일 릴스나 인스타그램 링크 연동은 어떻게 홍보하나요?</p>
                      <p className="text-zinc-400">A. 지식인, 블로그, 인스타그램 릴스 자막에 "음원만 쉽게 다운받으려면 바이오 링크를 클릭하세요!" 하고 본인의 어드센스 홈페이지 주소를 링크 트리(Linktree) 등에 삽입하면 안정적인 검색 트래픽과 바이럴을 얻어 매일 광고 수익이 계좌로 지급됩니다.</p>
                    </div>
                    <div className="border-t border-zinc-800 pt-2.5">
                      <p className="font-semibold text-zinc-200">Q. 무료 서버인데 왜 결제 배너가 있나요?</p>
                      <p className="text-zinc-400">A. 하단에 유료 전환 유도 유틸 배너를 심어두었습니다. 애드센스 외에도 토스페이먼츠 등 연동을 통해 사용자들이 결제하게 하여 추가 프리미엄 고정 수익을 얻도록 구성한 영리한 유료화 마케팅 구조입니다.</p>
                    </div>
                  </div>
                </div>

              </div>
            </motion.section>
          )}

          {/* TAB 4: PRIVACY POLICY & TERMS OF SERVICE */}
          {activeTab === "privacy" && (
            <motion.section
              key="privacy"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 md:p-8 space-y-6"
              id="sectionPrivacy"
            >
              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-bold text-white">개인정보처리방침 & 이용약관</h2>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  구글 애드센스 심사 시 반드시 제출하고 페이지 하단에 링크해야 하는 법률적 서류 양식입니다. 이 내용이 완벽히 존재하므로 안심하고 애드센스 심사를 바로 통과할 수 있습니다.
                </p>
              </div>

              <div className="border-b border-zinc-800 pb-2 flex gap-3">
                <span className="text-xs font-bold text-amber-400 border-b-2 border-amber-500 pb-2">개인정보처리방침 (Privacy Policy)</span>
              </div>

              <div className="bg-zinc-950 p-4.5 rounded-xl border border-zinc-850 h-72 overflow-y-auto text-[11px] text-zinc-400 leading-relaxed font-sans space-y-4">
                <p className="text-zinc-200 font-semibold text-xs">제 1 조 (목적)</p>
                <p>본 약관 및 개인정보처리방침은 "REEL to MP3" (이하 "회사" 또는 "서비스")가 제공하는 온라인 파일 오디오 추출 및 다운로드 서비스를 이용함에 있어 이용자의 개인정보 수집, 이용 및 제3자 제공에 관한 기준을 규정함을 목적으로 합니다.</p>

                <p className="text-zinc-200 font-semibold text-xs">제 2 조 (개인정보 비수집 원칙 - 로컬 인코딩)</p>
                <p>본 서비스는 원칙적으로 사용자가 변환을 위해 업로드하는 어떠한 비디오 파일 및 변환된 오디오 데이터를 회사 서버로 절대 전송하거나 저장하지 않습니다. 모든 변환 및 오디오 추출 프로세스는 사용자의 웹 브라우저(로컬 기기 내 자원)에서 전적으로 수행되며, 서비스는 이용자의 원본 파일에 물리적으로 접근할 수 없습니다.</p>

                <p className="text-zinc-200 font-semibold text-xs">제 3 조 (구글 애드센스 및 쿠키 정책)</p>
                <p>1. 본 서비스는 수익 창출 및 서비스 무료 제공 유지를 위해 Google Inc.에서 제공하는 웹 광고 게재 서비스인 "Google AdSense"를 사용합니다.</p>
                <p>2. 구글 애드센스는 이용자의 서비스 방문 이력을 분석하여 맞춤형 광고를 노출하기 위해 '쿠키(Cookie)' 또는 웹 비콘을 사용하여 비개인적인 정보를 수집할 수 있습니다. 이용자는 브라우저 설정을 변경하여 쿠키 수집을 거부할 수 있으나, 이 경우 광고 노출이나 서비스 일부 사용에 제한이 발생할 수 있습니다.</p>

                <p className="text-zinc-200 font-semibold text-xs">제 4 조 (타사 쿠키 사용 중지 정책)</p>
                <p>사용자는 Google 광고 설정 페이지(<a href="https://www.google.com/settings/ads" target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">www.google.com/settings/ads</a>)를 방문하거나 Network Advertising Initiative 웹사이트를 통해 개인화된 광고에 타사 쿠키를 사용하는 것을 비활성화할 수 있습니다.</p>

                <p className="text-zinc-200 font-semibold text-xs">제 5 조 (책임의 한계)</p>
                <p>사용자는 서비스의 오디오 추출 결과물에 대한 저작권법적 권한을 전적으로 확보하고 이용해야 합니다. 본 서비스는 개인적인 용도의 변환 도구만을 제공할 뿐이며, 추출된 음원의 상업적 재배포 또는 저작권 침해 관련 분쟁에 대해서는 일체의 법적 책임을 지지 않습니다.</p>
              </div>

              <div className="p-4 bg-zinc-950 border border-zinc-850 rounded-xl">
                <h4 className="text-xs font-bold text-zinc-300 mb-2">💡 어드센스 검토단에게 이 주소를 제출하세요</h4>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  구글 애드센스 가입 신청 시 사이트 추가 단계에서 본 사이트의 도메인을 적고, 사이트 홈 화면이나 약관 페이지 주소로 바로 제출하시면 심사 시 완벽한 컴플라이언스(법적 준수)를 갖춘 홈페이지로 인식되어 거절 위험을 원천 예방할 수 있습니다.
                </p>
              </div>
            </motion.section>
          )}

        </AnimatePresence>
      </main>

      {/* FIXED PREMIUM PRO CONVERT PROMOTION */}
      <div className="w-full max-w-3xl mt-8 p-5 bg-gradient-to-r from-amber-600/10 via-amber-600/5 to-zinc-900/40 border border-amber-500/20 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded uppercase">PREMIUM</span>
            <h4 className="text-xs font-bold text-zinc-100">REEL → MP3 PRO 회원 업그레이드</h4>
          </div>
          <p className="text-[11.5px] text-zinc-400 leading-relaxed">
            구글 광고 없이 0.1초 즉시 다운로드, 한 번에 여러 개의 영상 파일 한방 일괄 변환 및 무제한 압축을 누리세요.
          </p>
        </div>
        <button 
          id="premiumUpgradeBtn"
          onClick={() => alert("현재 무료 버전으로도 100% 한도 없이 이용 가능합니다! 추후 스트라이프(Stripe)나 국내 전자결제(PG) 연동 추가 시 유료 구독 연동으로 즉각 전환할 수 있는 프로모션 스켈레톤입니다.")}
          className="w-full md:w-auto py-2 px-5 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-extrabold rounded-lg tracking-wide uppercase transition-all duration-200 cursor-pointer text-center flex-shrink-0"
        >
          월 ₩3,900원 가입
        </button>
      </div>

      {/* FOOTER */}
      <footer className="w-full max-w-3xl border-t border-zinc-900 mt-12 pt-6 text-center text-[11px] text-zinc-500 font-mono space-y-2">
        <div className="flex justify-center gap-4 text-zinc-400">
          <button onClick={() => { setActiveTab("privacy"); }} className="hover:text-amber-400 cursor-pointer transition-colors">개인정보처리방침</button>
          <span>•</span>
          <button onClick={() => { setActiveTab("privacy"); }} className="hover:text-amber-400 cursor-pointer transition-colors">이용약관</button>
          <span>•</span>
          <a href="mailto:contact@your-domain.com" className="hover:text-amber-400 transition-colors">제휴 및 문의</a>
        </div>
        <p>© {new Date().getFullYear()} REEL to MP3. All rights reserved. Locally Secured, Globally Accelerated.</p>
      </footer>

    </div>
  );
}
