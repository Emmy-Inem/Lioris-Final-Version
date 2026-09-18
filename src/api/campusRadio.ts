/**
 * Live Campus & National Radio Streaming Service
 * Powered by Radio Browser API (radio-browser.info) + Verified Direct Streamguys/Icecast Relays.
 * 100% Free, Zero Auth, Global Radio Index with 40,000+ Stations.
 */

export interface RadioStation {
  id: string;
  name: string;
  frequency: string;
  campusOrCity: string;
  category: 'Campus & Education' | 'News & Talk' | 'Music & Culture' | 'Study & Lo-Fi';
  streamUrl: string;
  backupStreamUrl?: string;
  description: string;
  favicon?: string;
  codec?: string;
  bitrate?: number;
  isLive: boolean;
}

export const VERIFIED_STATIONS: RadioStation[] = [
  {
    id: 'cool-fm-lagos',
    name: 'Cool FM',
    frequency: '96.9 FM',
    campusOrCity: 'Lagos & Campus Youth',
    category: 'Music & Culture',
    streamUrl: 'https://coolfmlagos969-atunwadigital.streamguys1.com/coolfmlagos969',
    description: '#1 Hit Music Station - Top Afrobeats, campus chartbusters, and student entertainment.',
    codec: 'MP3',
    bitrate: 128,
    isLive: true,
  },
  {
    id: 'nigeria-info-fm',
    name: 'Nigeria Info',
    frequency: '99.3 FM',
    campusOrCity: 'Lagos & National',
    category: 'News & Talk',
    streamUrl: 'https://nigeriainfofmlagos993-atunwadigital.streamguys1.com/nigeriainfofmlagos993',
    description: 'Talk, News & Sports - Live national public affairs, university analysis, and student debates.',
    codec: 'MP3',
    bitrate: 128,
    isLive: true,
  },
  {
    id: 'wazobia-fm-lagos',
    name: 'Wazobia FM',
    frequency: '95.1 FM',
    campusOrCity: 'Lagos & Southwest',
    category: 'Music & Culture',
    streamUrl: 'https://wazobiafmlagos951-atunwadigital.streamguys1.com/wazobiafmlagos951',
    description: 'Ogbonge Station - Authentic Nigerian pidgin talk, campus humor, and vibrant Afropop.',
    codec: 'MP3',
    bitrate: 128,
    isLive: true,
  },
  {
    id: 'agidigbo-fm-ibadan',
    name: 'Agidigbo 88.7 FM',
    frequency: '88.7 FM',
    campusOrCity: 'Ibadan (UI Region)',
    category: 'Campus & Education',
    streamUrl: 'https://agidigbostream.com.ng/radio/8000/radio.mp3',
    description: 'The People\'s Voice - Groundbreaking investigative broadcast, community news, and cultural shows in Ibadan.',
    codec: 'MP3',
    bitrate: 128,
    isLive: true,
  },
  {
    id: 'metro-fm-lagos',
    name: 'Metro FM',
    frequency: '97.7 FM',
    campusOrCity: 'Lagos (UNILAG Region)',
    category: 'Campus & Education',
    streamUrl: 'https://go.webgateready.com/metrofm/radio.mp3',
    description: 'Urban university broadcast, intellectual symposiums, and smooth soul grooves.',
    codec: 'MP3',
    bitrate: 128,
    isLive: true,
  },
  {
    id: 'bond-fm-lagos',
    name: 'Bond FM',
    frequency: '92.9 FM',
    campusOrCity: 'Lagos State',
    category: 'News & Talk',
    streamUrl: 'https://go.webgateready.com/bondfm',
    description: 'Indigenous languages cultural station connecting grassroots communities.',
    codec: 'MP3',
    bitrate: 128,
    isLive: true,
  },
  {
    id: 'afrofusion-radio',
    name: 'Afrofusion HD',
    frequency: 'Digital HD',
    campusOrCity: 'West Africa Online',
    category: 'Music & Culture',
    streamUrl: 'https://a10.asurahosting.com:7120/radio.mp3',
    description: 'Continuous high-definition Afrobeats, Amapiano, and African indie artist spotlight.',
    codec: 'MP3',
    bitrate: 128,
    isLive: true,
  },
  {
    id: 'campus-study-lofi',
    name: 'Campus Study Lo-Fi',
    frequency: 'Study Stream',
    campusOrCity: 'Academic Library Audio',
    category: 'Study & Lo-Fi',
    streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3',
    description: 'Deep focus instrumental chillout beats engineered for reading, past question prep, and late-night coding.',
    codec: 'MP3',
    bitrate: 128,
    isLive: true,
  },
  {
    id: 'deep-focus-beats',
    name: 'Deep Focus Ambient',
    frequency: 'Library HD',
    campusOrCity: 'E-Library Ambient',
    category: 'Study & Lo-Fi',
    streamUrl: 'https://ice2.somafm.com/defcon-128-mp3',
    description: 'Downtempo electronic ambient audio designed to elevate concentration and reduce study fatigue.',
    codec: 'MP3',
    bitrate: 128,
    isLive: true,
  },
  {
    id: 'bbc-world-service',
    name: 'BBC World Service',
    frequency: 'Global HD',
    campusOrCity: 'International',
    category: 'News & Talk',
    streamUrl: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service',
    description: 'International news, global science breakthroughs, and in-depth educational documentaries.',
    codec: 'MP3',
    bitrate: 96,
    isLive: true,
  },
];

export const CAMPUS_STATIONS = VERIFIED_STATIONS;

/**
 * Searches the global Radio Browser API for live Nigerian & world radio stations.
 */
export async function searchOnlineStations(query: string, country: string = 'Nigeria'): Promise<RadioStation[]> {
  const cleanQ = query.trim();
  const searchUrl = cleanQ
    ? `https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(cleanQ)}&countrycode=NG&limit=20`
    : `https://de1.api.radio-browser.info/json/stations/bycountry/${encodeURIComponent(country)}?order=clickcount&reverse=true&limit=25`;

  try {
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'LiorisCampusApp/2.0' },
    });
    if (!res.ok) throw new Error(`Radio Browser returned status ${res.status}`);
    const data = await res.json();

    if (Array.isArray(data) && data.length > 0) {
      const mapped: RadioStation[] = data
        .filter((s: any) => s.url_resolved && s.url_resolved.startsWith('http'))
        .map((s: any) => ({
          id: s.stationuuid || `rb-${Math.random().toString(36).substring(2, 8)}`,
          name: s.name || 'Unnamed Radio Station',
          frequency: s.tags?.split(',')[0] || 'Live FM',
          campusOrCity: s.state || s.country || 'Nigeria',
          category: s.tags?.toLowerCase().includes('news')
            ? 'News & Talk'
            : s.tags?.toLowerCase().includes('study') || s.tags?.toLowerCase().includes('ambient')
            ? 'Study & Lo-Fi'
            : s.tags?.toLowerCase().includes('edu') || s.tags?.toLowerCase().includes('campus')
            ? 'Campus & Education'
            : 'Music & Culture',
          streamUrl: s.url_resolved,
          description: s.tags ? `Genre: ${s.tags.split(',').slice(0, 3).join(', ')}` : 'Live streaming broadcast',
          favicon: s.favicon || undefined,
          codec: s.codec || 'MP3',
          bitrate: s.bitrate || 128,
          isLive: true,
        }));

      return mapped.length > 0 ? mapped : VERIFIED_STATIONS;
    }
  } catch (err: any) {
    console.warn('[CampusRadio] Radio Browser API search failed, using verified catalog:', err?.message ?? err);
  }

  // Fallback to searching verified catalog locally
  if (cleanQ) {
    const filtered = VERIFIED_STATIONS.filter(
      (s) =>
        s.name.toLowerCase().includes(cleanQ.toLowerCase()) ||
        s.description.toLowerCase().includes(cleanQ.toLowerCase()) ||
        s.campusOrCity.toLowerCase().includes(cleanQ.toLowerCase()) ||
        s.category.toLowerCase().includes(cleanQ.toLowerCase())
    );
    return filtered.length > 0 ? filtered : VERIFIED_STATIONS;
  }

  return VERIFIED_STATIONS;
}

export interface RadioPlaybackState {
  currentStation: RadioStation;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  isMuted: boolean;
  errorMessage?: string | null;
}

type RadioListener = (state: RadioPlaybackState) => void;

class CampusRadioManager {
  private static instance: CampusRadioManager;
  private listeners = new Set<RadioListener>();
  private audioElement: any = null;
  private state: RadioPlaybackState = {
    currentStation: VERIFIED_STATIONS[0],
    isPlaying: false,
    isLoading: false,
    volume: 0.85,
    isMuted: false,
    errorMessage: null,
  };

  private constructor() {
    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      this.audioElement = new Audio();
      this.audioElement.volume = this.state.volume;
      this.audioElement.preload = 'none';

      this.audioElement.addEventListener('playing', () => {
        this.updateState({ isPlaying: true, isLoading: false, errorMessage: null });
      });
      this.audioElement.addEventListener('pause', () => {
        this.updateState({ isPlaying: false, isLoading: false });
      });
      this.audioElement.addEventListener('waiting', () => {
        this.updateState({ isLoading: true });
      });
      this.audioElement.addEventListener('canplay', () => {
        this.updateState({ isLoading: false });
      });
      this.audioElement.addEventListener('error', () => {
        console.warn('[CampusRadio] Audio playback error on station:', this.state.currentStation.name);
        if (this.state.currentStation.backupStreamUrl && this.audioElement.src !== this.state.currentStation.backupStreamUrl) {
          if (__DEV__) console.log('[CampusRadio] Switching to backup stream URL...');
          this.audioElement.src = this.state.currentStation.backupStreamUrl;
          this.audioElement.play().catch(() => {});
        } else {
          this.updateState({
            isPlaying: false,
            isLoading: false,
            errorMessage: 'Station currently buffering or offline',
          });
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
      this.updateState({ currentStation: station, isLoading: true, errorMessage: null });
      this.audioElement.src = station.streamUrl;
      this.audioElement.play().catch((err: any) => {
        console.warn('[CampusRadio] Play promise rejected:', err?.message || err);
        this.updateState({ isPlaying: false, isLoading: false });
      });
    } else {
      this.updateState({ currentStation: station, isPlaying: true, errorMessage: null });
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
      this.setVolume(this.state.volume || 0.85);
      this.updateState({ isMuted: false });
    } else {
      if (this.audioElement) this.audioElement.volume = 0;
      this.updateState({ isMuted: true });
    }
  }
}

export const campusRadio = CampusRadioManager.getInstance();
