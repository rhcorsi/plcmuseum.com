import { useEffect, useRef, useState } from 'react';
import { LANG_TAGS } from '../i18n/langs';
import { CENTER_CHANGE_EVENT, type CoverFlowProps, type ExhibitCard } from './contracts';
import { enhanceStage } from './coverflow/stage';
import { notifyCenterChange } from './coverflow/navigation';
import '../styles/coverflow.css';

export default function CoverFlow({ exhibits, listId, initialId, lang, labels, onCenterChange }: CoverFlowProps) {
  const [active, setActive] = useState<ExhibitCard | undefined>(
    () => exhibits.find((card) => card.id === initialId) ?? exhibits[0],
  );
  const [announced, setAnnounced] = useState<ExhibitCard>();
  const [enhanced, setEnhanced] = useState(false);
  const stage = useRef<ReturnType<typeof enhanceStage> | null>(null);
  const controls = useRef<HTMLDivElement>(null);
  const callback = useRef(onCenterChange);
  const input = useRef({ exhibits, initialId });
  callback.current = onCenterChange;
  input.current = { exhibits, initialId };

  useEffect(() => {
    function attach() {
      const list = document.getElementById(listId);
      if (!list) return;
      stage.current = enhanceStage({
        list,
        controls: controls.current,
        ...input.current,
        onActive: setActive,
        onEnhanced: setEnhanced,
        onSettled(card, announce) {
          setAnnounced(announce ? card : undefined);
          notifyCenterChange(card, callback, (detail) => {
            document.dispatchEvent(new CustomEvent(CENTER_CHANGE_EVENT, { detail }));
          });
        },
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
    else attach();
    return () => {
      document.removeEventListener('DOMContentLoaded', attach);
      stage.current?.destroy();
      stage.current = null;
    };
  }, [listId]);

  return (
    <div className="coverflow" lang={LANG_TAGS[lang]}>
      <div ref={controls} className="coverflow-controls" data-enhanced={enhanced}>
        <button
          type="button"
          aria-controls={listId}
          aria-label={labels.prev}
          disabled={exhibits.length < 2}
          onClick={() => stage.current?.move(-1)}
        >
          <span aria-hidden="true">←</span>
        </button>
        <a
          href={active?.href}
          className="coverflow-open"
          aria-describedby={active ? `stage-name-${active.id}` : undefined}
        >
          {labels.open}
        </a>
        <button
          type="button"
          aria-controls={listId}
          aria-label={labels.next}
          disabled={exhibits.length < 2}
          onClick={() => stage.current?.move(1)}
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="coverflow-announcement" aria-live="polite" aria-atomic="true">
        {announced && (
          <>
            <span>
              {announced.name}, {announced.yearLabel}.{' '}
            </span>
            <span lang={LANG_TAGS[announced.textLang]}>{announced.tagline}</span>
          </>
        )}
      </p>
    </div>
  );
}
