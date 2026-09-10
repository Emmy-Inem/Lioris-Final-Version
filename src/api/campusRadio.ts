/**
 * Live Campus Radio Streaming Service
 * Connects to Nigerian university campus radio streams, educational broadcasts, and audio relays.
 */

export interface RadioStation {
  id: string;
  name: string;
  frequency: string;
  campus: string;
  city: string;
  streamUrl: string;
  backupStreamUrl?: string;
  description: string;
  genre: string;
  isLive: boolean;
}

export const CAMPUS_STATIONS: RadioStation[] = [
  {
    id: 'ui-diamond-fm',
    name: 'Diamond FM',
    frequency: '101.1 FM',
    campus: 'University of Ibadan',
    city: 'Ibadan',
    streamUrl: 'https://stream.zeno.fm/f3wvbbqmdg8uv',
    backupStreamUrl: 'https://icecast.media.gov.ng/diamondfm.mp3',
    description: 'The Tower Station - Official broadcast service of the Premier University, featuring academic discussions and campus news.',
    genre: 'Campus News & Talk',
    isLive: true,
  },
  {
    id: 'unilag-fm',
    name: 'UNILAG Radio',
    frequency: '103.1 FM',
    campus: 'University of Lagos',
    city: 'Akoka, Lagos',
    streamUrl: 'https://stream.zeno.fm/0t3z757g7h8uv',
    backupStreamUrl: 'https://live.unilagfm.com/stream',
    description: 'The Voice of Akoka - Student lifestyle, departmental updates, intellectual symposiums, and indie campus hits.',
    genre: 'Campus Culture & Music',
    isLive: true,
  },
  {
    id: 'oau-great-fm',
    name: 'Great FM',
    frequency: '94.5 FM',
    campus: 'Obafemi Awolowo University',
    city: 'Ile-Ife',
    streamUrl: 'https://stream.zeno.fm/u8s1p8w904zuv',
    description: 'Voice of Great Ife - Intellectual debate, university council bulletins, and vibrant student entertainment.',
    genre: 'Intellectual & Music',
    isLive: true,
  },
  {
    id: 'abu-radio',
    name: 'ABU FM',
    frequency: '101.5 FM',
    campus: 'Ahmadu Bello University',
    city: 'Zaria',
    streamUrl: 'https://stream.zeno.fm/0k6k7b9g7h8uv',
    description: 'Naturally Ahead - Educational programs, agricultural research spotlights, and northern student culture.',
    genre: 'Education & News',
    isLive: true,
  },
  {
    id: 'nuc-academic-stream',
    name: 'Campus Scholar Stream',
    frequency: 'Digital HD',
    campus: 'Inter-University Educational Network',
    city: 'Abuja',
    streamUrl: 'https://stream.zeno.fm/s4k8178g7h8uv',
    description: '24/7 Educational lectures, career insights, technology seminars, and scholarly debates.',
    genre: 'Lectures & Podcasts',
    isLive: true,
  },
];

export interface RadioPlaybackState {
  currentStation: RadioStation;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  isMuted: boolean;
}

type RadioListener = (state: RadioPlaybackState) => void;

class CampusRadioManager {
  private static instance: CampusRadioManager;
  private listeners = new Set<RadioListener>();
  private audioElement: any = null;
  private state: RadioPlaybackState = {
    currentStation: CAMPUS_STATIONS[0],
    isPlaying: false,
    isLoading: false,
    volume: 0.85,
    isMuted: false,
  };

  private constructor() {
    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      this.audioElement = new Audio();
      this.audioElement.volume = this.state.volume;
      this.audioElement.addEventListener('playing', () => {
        this.updateState({ isPlaying: true, isLoading: false });
      });
      this.audioElement.addEventListener('pause', () => {
        this.updateState({ isPlaying: false, isLoading: false });
      });
      this.audioElement.addEventListener('waiting', () => {
        this.updateState({ isLoading: true });
      });
      this.audioElement.addEventListener('error', () => {
        console.warn('[CampusRadio] Stream error, attempting backup stream');
        if (this.state.currentStation.backupStreamUrl && this.audioElement.src !== this.state.currentStation.backupStreamUrl) {
          this.audioElement.src = this.state.currentStation.backupStreamUrl;
          this.audioElement.play().catch(() => {});
        } else {
          this.updateState({ isPlaying: false, isLoading: false });
        }
      });
    }
  }

  public static getInstance(): CampusRadioManager {
    if (!CampusRadioManager.instance) {
      CampusRadioManager.instance = new CampusRadioManager();
    }
    return CampusRadioManager.instance;
  }

  public getState(): RadioPlaybackState {
    return { ...this.state };
  }

  public subscribe(listener: RadioListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateState(partial: Partial<RadioPlaybackState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((l) => l(this.getState()));
  }

  public playStation(station: RadioStation) {
    if (this.audioElement) {
      this.updateState({ currentStation: station, isLoading: true });
      this.audioElement.src = station.streamUrl;
      this.audioElement.play().catch((err: any) => {
        console.warn('[CampusRadio] Autoplay error:', err);
        this.updateState({ isPlaying: false, isLoading: false });
      });
    } else {
      this.updateState({ currentStation: station, isPlaying: true });
    }
  }

  public togglePlay() {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.playStation(this.state.currentStation);
    }
  }

  public pause() {
    if (this.audioElement) {
      this.audioElement.pause();
    }
    this.updateState({ isPlaying: false, isLoading: false });
  }

  public setVolume(vol: number) {
    const clamped = Math.max(0, Math.min(1, vol));
    if (this.audioElement) {
      this.audioElement.volume = clamped;
    }
    this.updateState({ volume: clamped, isMuted: clamped === 0 });
  }

  public toggleMute() {
    if (this.state.isMuted) {
      this.setVolume(this.state.volume || 0.8);
      this.updateState({ isMuted: false });
    } else {
      if (this.audioElement) this.audioElement.volume = 0;
      this.updateState({ isMuted: true });
    }
  }
}

export const campusRadio = CampusRadioManager.getInstance();
