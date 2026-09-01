import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Building2, CalendarDays, CheckCircle2, Download, FileText, Link2Off, Loader2, Paperclip,
  Send, Upload,
} from 'lucide-react';

import { ApiError, guest } from '../lib/api';
import { useAction, useAsync } from '../lib/hooks';
import { formatBytes, formatDate, relativeTime } from '../lib/format';
import { priorityLabel, subtaskStatusLabel, subtaskStatusTone } from '../lib/labels';
import type { GuestWorkspace } from '../lib/types';
import { Banner, Button, Card, Chip, EmptyState, Skeleton } from '../components/ui';

const COUNCIL = 'מועצה מקומית בוקעאתא';

export default function ExternalWorkspace() {
  const { token = '' } = useParams<{ token: string }>();
  const [comment, setComment] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [finished, setFinished] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { busy, run } = useAction();

  const workspace = useAsync<GuestWorkspace>(
    () => guest.get<GuestWorkspace>(`/external/subtask/${token}`), [token]);

  // An invalid, revoked, expired or completed link all arrive as 410 and get
  // the same message: the page must not reveal which case applies.
  const gone = workspace.error !== null || finished;

  if (workspace.loading) {
    return (
      <div className="guest">
        <GuestBar />
        <div className="guest__wrap stack">
          <Skeleton height={28} width="45%" />
          <Skeleton height={120} radius={14} />
          <Skeleton height={200} radius={14} />
        </div>
      </div>
    );
  }

  if (gone || !workspace.data) {
    return (
      <div className="guest">
        <GuestBar />
        <div className="guest__closed">
          <Card>
            <div className="card__body">
              <EmptyState
                icon={<Link2Off />}
                title="הקישור אינו פעיל עוד"
                text={finished
                  ? 'תודה. המשימה סומנה כהושלמה והקישור הפסיק לפעול. אין צורך בפעולה נוספת.'
                  : 'הקישור אינו פעיל עוד מכיוון שהמשימה הושלמה או נסגרה. אם נדרשת פעולה נוספת, פנו לאיש הקשר במועצה.'}
              />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const data = workspace.data;
  const { subtask } = data;

  const send = (status?: 'in_progress' | 'resolved') => {
    if (!comment.trim() && !status) return;
    void run(
      () => guest.patch(`/external/subtask/${token}`, {
        comment: comment.trim() || null,
        status: status ?? null,
      }),
      {
        onSuccess: () => {
          setComment('');
          if (status === 'resolved') { setFinished(true); return; }
          setNotice(status ? 'הסטטוס עודכן' : 'התגובה נשלחה');
          workspace.reload();
        },
        onError: (message) => setNotice(message),
      },
    );
  };

  const choose = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await guest.upload(`/external/subtask/${token}/attachments`, file);
      setNotice('הקובץ הועלה');
      workspace.reload();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'העלאת הקובץ נכשלה');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="guest">
      <GuestBar
        right={
          <>
            <span className="cell-number">{subtask.number}</span>
            <Chip tone={subtaskStatusTone[subtask.status]} dot>
              {subtaskStatusLabel[subtask.status]}
            </Chip>
          </>
        }
      />

      <div className="guest__wrap stack">
        {notice && <Banner tone="info">{notice}</Banner>}

        <Card>
          <div className="card__body stack">
            <div>
              <h1 className="guest__title">{subtask.title}</h1>
              <div className="row row--wrap"
                   style={{ gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                {data.assignee.name && (
                  <span className="cell-meta">עבור: {data.assignee.name}
                    {data.assignee.organization && ` · ${data.assignee.organization}`}</span>
                )}
                {subtask.due_date && (
                  <span className="cell-meta">
                    <CalendarDays size={13} style={{ verticalAlign: -2 }} />{' '}
                    תאריך יעד: {formatDate(subtask.due_date)}
                  </span>
                )}
                <span className="cell-meta">דחיפות: {priorityLabel[subtask.priority]}</span>
              </div>
            </div>

            {subtask.description && (
              <p className="guest__desc">{subtask.description}</p>
            )}

            {data.ticket && (
              <p className="cell-meta">
                המשימה שייכת לפנייה {data.ticket.number} — {data.ticket.subject}
              </p>
            )}
          </div>
        </Card>

        {data.attachments.length > 0 && (
          <Card>
            <div className="card__header">
              <Paperclip size={17} />
              <h3 className="card__title">קבצים שצורפו עבורך</h3>
            </div>
            <div className="card__body worklist">
              {data.attachments.map((file) => (
                <div className="work-item" key={file.id}>
                  <span className="work-item__icon work-item__icon--internal">
                    <FileText size={17} />
                  </span>
                  <div className="grow">
                    <div className="work-item__title">{file.filename}</div>
                    <div className="work-item__meta">
                      <span>{formatBytes(file.size_bytes)}</span>
                      <span>{relativeTime(file.created_at)}</span>
                    </div>
                  </div>
                  <a
                    className="btn btn--secondary btn--sm"
                    href={`${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}/external/subtask/${token}/attachments/${file.id}`}
                    download={file.filename}
                  >
                    <Download size={14} /> הורדה
                  </a>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <div className="card__header">
            <h3 className="card__title">התכתבות</h3>
          </div>
          <div className="card__body stack" style={{ gap: 'var(--space-5)' }}>
            {data.comments.length === 0 ? (
              <p className="cell-meta">אין עדיין תגובות. אפשר לכתוב עדכון למטה.</p>
            ) : (
              <div className="timeline">
                {data.comments.map((entry, index) => (
                  <div
                    className={`entry entry--${entry.author_kind === 'external' ? 'requester' : 'staff'}`}
                    key={index}
                  >
                    <span className="avatar avatar--sm">{entry.author.slice(0, 2)}</span>
                    <div className="entry__body">
                      <div className="entry__head">
                        <span className="entry__author">{entry.author}</span>
                        <span className="entry__time">{relativeTime(entry.created_at)}</span>
                      </div>
                      <div className="entry__bubble">{entry.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="composer">
              <textarea
                className="textarea"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="עדכון, שאלה או דיווח על התקדמות…"
                aria-label="כתיבת עדכון"
              />
              <div className="composer__foot">
                <input ref={inputRef} type="file" hidden onChange={choose} />
                <Button
                  size="sm" variant="ghost" icon={uploading
                    ? <Loader2 className="spin" size={15} /> : <Upload size={15} />}
                  onClick={() => inputRef.current?.click()} disabled={uploading}
                >
                  צירוף קובץ
                </Button>
                <div className="grow" />
                <Button
                  size="sm" variant="primary" icon={<Send size={15} />}
                  loading={busy} disabled={!comment.trim()}
                  onClick={() => send()}
                >
                  שליחה
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="card__body stack">
            <div>
              <h3 style={{ fontSize: 'var(--text-md)' }}>עדכון סטטוס</h3>
              <p className="cell-meta">
                כשתסמנו את המשימה כהושלמה, המועצה תעודכן והקישור הזה יפסיק לפעול.
              </p>
            </div>
            <div className="row row--wrap" style={{ gap: 'var(--space-2)' }}>
              {subtask.status === 'open' && (
                <Button loading={busy} onClick={() => send('in_progress')}>
                  התחלתי לטפל
                </Button>
              )}
              <Button
                variant="success" loading={busy} icon={<CheckCircle2 size={16} />}
                onClick={() => send('resolved')}
              >
                סיימתי — סימון המשימה כהושלמה
              </Button>
            </div>
          </div>
        </Card>

        <p className="cell-meta" style={{ textAlign: 'center' }}>
          קישור זה אישי ומיועד למשימה זו בלבד. אין למסור אותו לגורם אחר.
        </p>
      </div>
    </div>
  );
}

function GuestBar({ right }: { right?: React.ReactNode }) {
  return (
    <header className="guest__bar">
      <div className="guest__bar-inner">
        <span className="login__mark"><Building2 size={18} /></span>
        <div className="grow">
          <div className="appbar__brand-name">משימה לטיפול</div>
          <div className="appbar__brand-council">{COUNCIL}</div>
        </div>
        {right}
      </div>
    </header>
  );
}
