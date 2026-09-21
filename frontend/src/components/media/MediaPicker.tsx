/**
 * Collects photographs, video and voice notes before they have anywhere to go.
 *
 * A ticket's attachments hang off a ticket id, which does not exist while the
 * new-ticket wizard is still being filled in. So this holds real File objects
 * in memory, shows them back, and leaves uploading to the caller once the
 * ticket has been created. Each item carries an object URL for preview; the
 * caller does not have to think about revoking them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera, FileText, Image as ImageIcon, Mic, Paperclip, Play, Square, Trash2, Video,
} from 'lucide-react';

import { formatBytes } from '../../lib/format';
import { Button } from '../ui';

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

export interface PendingMedia {
  id: string;
  file: File;
  kind: MediaKind;
  /** Object URL, revoked when the item is removed or the picker unmounts. */
  url: string;
}

/** Mirrors ALLOWED_UPLOAD_* in backend/app/config.py. Kept as accept strings so
 *  the file dialog filters to the same set the server will accept. */
const ACCEPT = {
  image: 'image/jpeg,image/png,image/gif,image/webp,image/heic,.jpg,.jpeg,.png,.gif,.webp,.heic',
  video: 'video/mp4,video/quicktime,video/webm,video/3gpp,.mp4,.mov,.webm,.3gp',
  audio: 'audio/*,.m4a,.mp3,.ogg,.oga,.wav,.aac,.webm',
  file: '.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,application/pdf,text/plain,text/csv',
} as const;

/** Everything the server accepts, for a file dialog that offers one list. */
export const UPLOAD_ACCEPT = Object.values(ACCEPT).join(',');

const MAX_BYTES = 50 * 1024 * 1024;

export function kindOf(file: File | { content_type: string }): MediaKind {
  const type = 'type' in file ? file.type : file.content_type;
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
}

let seq = 0;

/** Picks the first container the browser will actually record into. Chrome and
 *  Firefox give webm, Safari mp4; asking for one it cannot do throws. */
function recorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

interface Props {
  items: PendingMedia[];
  onChange: (items: PendingMedia[]) => void;
  disabled?: boolean;
}

export function MediaPicker({ items, onChange, disabled }: Props) {
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  // Object URLs outlive React state, so they are released explicitly. The ref
  // mirrors `items` for the unmount cleanup, which must not re-run per change.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => {
    itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  const add = useCallback((files: File[]) => {
    const accepted: PendingMedia[] = [];
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        setError(`${file.name} גדול מהמותר (${formatBytes(MAX_BYTES)})`);
        continue;
      }
      if (file.size === 0) {
        setError(`${file.name} ריק`);
        continue;
      }
      accepted.push({
        id: `m${++seq}`,
        file,
        kind: kindOf(file),
        url: URL.createObjectURL(file),
      });
    }
    if (accepted.length) {
      setError('');
      onChange([...itemsRef.current, ...accepted]);
    }
  }, [onChange]);

  const remove = (id: string) => {
    const target = itemsRef.current.find((item) => item.id === id);
    if (target) URL.revokeObjectURL(target.url);
    onChange(itemsRef.current.filter((item) => item.id !== id));
  };

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const startRecording = async () => {
    setError('');
    const mime = recorderMime();
    if (!mime) {
      setError('הדפדפן הזה אינו תומך בהקלטה. אפשר לצרף קובץ שמע במקום.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('אין גישה למיקרופון. יש לאשר את ההרשאה בדפדפן ולנסות שוב.');
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
      const blob = new Blob(chunksRef.current, { type: mime });
      // The extension has to match what the server allows, and it is derived
      // from the container we just recorded into, not guessed from the name.
      const ext = mime.startsWith('audio/mp4') ? 'm4a' : 'webm';
      const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
      add([new File([blob], `הקלטה-${stamp}.${ext}`, { type: mime })]);
    };

    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((n) => n + 1), 1000);
  };

  const pick = (accept: string, capture?: 'environment' | 'user') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = !capture;
    input.accept = accept;
    if (capture) input.capture = capture;
    input.onchange = () => add(Array.from(input.files ?? []));
    input.click();
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (disabled) return;
    add(Array.from(event.dataTransfer.files));
  };

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${
    String(elapsed % 60).padStart(2, '0')}`;

  return (
    <div className="media">
      <div
        className="media__drop"
        onDrop={onDrop}
        onDragOver={(event) => event.preventDefault()}
      >
        <div className="media__actions">
          <Button type="button" icon={<ImageIcon size={16} />} disabled={disabled}
                  onClick={() => pick(ACCEPT.image)}>
            תמונה
          </Button>
          <Button type="button" icon={<Camera size={16} />} disabled={disabled}
                  onClick={() => pick(ACCEPT.image, 'environment')}>
            צילום
          </Button>
          <Button type="button" icon={<Video size={16} />} disabled={disabled}
                  onClick={() => pick(ACCEPT.video)}>
            וידאו
          </Button>
          {recording ? (
            <Button type="button" variant="danger" icon={<Square size={16} />}
                    onClick={stopRecording}>
              עצירה · {mmss}
            </Button>
          ) : (
            <Button type="button" icon={<Mic size={16} />} disabled={disabled}
                    onClick={() => void startRecording()}>
              הקלטה קולית
            </Button>
          )}
          <Button type="button" variant="ghost" icon={<Paperclip size={16} />} disabled={disabled}
                  onClick={() => pick(ACCEPT.file)}>
            קובץ
          </Button>
        </div>
        <p className="media__hint">
          אפשר גם לגרור לכאן קבצים · עד {formatBytes(MAX_BYTES)} לקובץ
        </p>
      </div>

      {error && <p className="field__error" role="alert">{error}</p>}

      {recording && (
        <p className="media__recording" role="status">
          <span className="media__pulse" aria-hidden /> מקליט… {mmss}
        </p>
      )}

      {items.length > 0 && (
        <ul className="media__list">
          {items.map((item) => (
            <li className="media__item" key={item.id}>
              <MediaThumb item={item} />
              <div className="media__meta">
                <span className="media__name" title={item.file.name}>{item.file.name}</span>
                <span className="media__size">{formatBytes(item.file.size)}</span>
              </div>
              <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={14} />}
                      aria-label={`הסרת ${item.file.name}`}
                      disabled={disabled} onClick={() => remove(item.id)}>
                הסרה
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MediaThumb({ item }: { item: PendingMedia }) {
  if (item.kind === 'image') {
    return <img className="media__thumb" src={item.url} alt="" />;
  }
  if (item.kind === 'video') {
    return <video className="media__thumb" src={item.url} controls preload="metadata" />;
  }
  if (item.kind === 'audio') {
    return (
      <span className="media__thumb media__thumb--audio">
        <Play size={18} aria-hidden />
        <audio src={item.url} controls preload="metadata" />
      </span>
    );
  }
  return (
    <span className="media__thumb media__thumb--file" aria-hidden>
      <FileText size={22} />
    </span>
  );
}
