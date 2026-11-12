/**
 * The one place the app touches react-native-google-cast. On web, Metro picks
 * up cast.web.ts instead, which simulates a couple of Chromecasts so the UI
 * can be previewed in a browser.
 */
export {
  CastButton,
  CastContext,
  CastState,
  MediaPlayerIdleReason,
  MediaPlayerState,
  MediaStreamType,
  useCastDevice,
  useCastSession,
  useCastState,
  useDevices,
  useMediaStatus,
  useRemoteMediaClient,
  useStreamPosition,
} from 'react-native-google-cast';

export type { Device, MediaLoadRequest, MediaStatus, RemoteMediaClient } from 'react-native-google-cast';

export const isSimulatedCast = false;
