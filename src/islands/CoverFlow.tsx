import { useEffect, useRef, useState } from 'react';
import { LANG_TAGS } from '../i18n/langs';
import { CENTER_CHANGE_EVENT, type CoverFlowProps, type ExhibitCard } from './contracts';
import { enhanceStage } from './coverflow/stage';
import '../styles/coverflow.css';

export default function CoverFlow({ exhibits, listId, initialId, lang, labels, onCenterChange }: CoverFlowProps) {
  const [active, setActive] = useState<ExhibitCard | undefined>(
    () => exhibits.find((card) => card.id === initialId) ?? exhibits[0],
  );
  const [announced, setAnnounced] = useState<ExhibitCard>();
  const [enhanced, setEnhanced] = useState(false);
  const stage = useRef<ReturnType<typeof enhanceStage> | null>(null);

  useEffect(() => {
    const list = document.getElementById(listId);
    if (!list) return;
    const controller = enhanceStage({
      list,
      exhibits,
      initialId,
      onActive: setActive,
      onEnhanced: setEnhanced,
      onSettled(card) {
        setAnnounced(card);
        document.dispatchEvent(
          new CustomEvent(CENTER_CHANGE_EVENT, { detail: { id: card.id, decade: card.decade, era: card.era } }),
        );
        onCenterChange?.(card.id);
      },
    });
    stage.current = controller;
    return () => {
      controller.destroy();
      stage.current = null;
    };
  }, [exhibits, initialId, listId, onCenterChange]);

  return (
    <div className="coverflow-controls" lang={LANG_TAGS[lang]} hidden={!enhanced}>
      <button
        type="button"
        aria-controls={listId}
        aria-label={labels.prev}
        disabled={exhibits.length < 2}
        onClick={() => stage.current?.move(-1)}
      >
        <span aria-hidden="true">←</span>
      </button>
      <a href={active?.href} className="coverflow-open">
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
