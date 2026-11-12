import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Film,
  Grid2X2,
  Keyboard,
  Layers3,
  Maximize2,
  MonitorPlay,
  Orbit,
  Palette,
  PenTool,
  RotateCcw,
  Save,
  Search,
  Shapes,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { FEATURE_GUIDE_TOPICS } from '../data/featureGuide';
import { requestGuideTarget, type GuideTarget } from '../lib/guideActions';

const TOPIC_ICONS: Record<string, LucideIcon> = {
  sources: Film,
  players: Layers3,
  geometry: Shapes,
  tracing: PenTool,
  output: Maximize2,
  grids: Grid2X2,
  appearance: Palette,
  present: MonitorPlay,
  planetarium: Orbit,
  calibration: Crosshair,
  saves: Save,
  shortcuts: Keyboard,
};

export function FeatureGuideDialog({ onClose }: { onClose: () => void }) {
  const [selectedId, setSelectedId] = useState(FEATURE_GUIDE_TOPICS[0].id);
  const [stepIndex, setStepIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const readingRef = useRef<HTMLElement>(null);

  const filteredTopics = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return FEATURE_GUIDE_TOPICS;
    return FEATURE_GUIDE_TOPICS.filter((topic) => [
      topic.title,
      topic.category,
      topic.summary,
      ...topic.overview,
      topic.note,
      ...topic.steps.flatMap((step) => [step.title, step.detail, ...(step.bullets ?? [])]),
    ].join(' ').toLocaleLowerCase().includes(needle));
  }, [query]);

  useEffect(() => {
    if (filteredTopics.length && !filteredTopics.some((topic) => topic.id === selectedId)) {
      setSelectedId(filteredTopics[0].id);
      setStepIndex(0);
    }
  }, [filteredTopics, selectedId]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    searchRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  const topic = FEATURE_GUIDE_TOPICS.find((candidate) => candidate.id === selectedId) ?? FEATURE_GUIDE_TOPICS[0];
  const topicIndex = FEATURE_GUIDE_TOPICS.findIndex((candidate) => candidate.id === topic.id);
  const step = topic.steps[stepIndex];
  const finished = completed.has(topic.id);
  const categories = [...new Set(filteredTopics.map((candidate) => candidate.category))];

  const chooseTopic = (id: string) => {
    setSelectedId(id);
    setStepIndex(0);
    readingRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  };

  const chooseStep = (index: number) => {
    setStepIndex(index);
    readingRef.current?.querySelector('.guide-walkthrough')?.scrollIntoView({ block: 'nearest' });
  };

  const restart = () => {
    setStepIndex(0);
    setCompleted((current) => {
      const next = new Set(current);
      next.delete(topic.id);
      return next;
    });
  };

  const openControls = (target: GuideTarget) => {
    onClose();
    window.setTimeout(() => requestGuideTarget(target), 0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="feature-guide-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        ref={dialogRef}
        className="feature-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feature-guide-title"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <header className="feature-guide-header">
          <div className="feature-guide-title-icon"><BookOpen size={24} /></div>
          <div>
            <span className="eyebrow">FREEFORM / FIELD MANUAL</span>
            <h2 id="feature-guide-title">What would you like to do?</h2>
            <p>Choose a feature, follow its walkthrough, then open the real controls when you are ready.</p>
          </div>
          <button type="button" className="icon-button feature-guide-close" aria-label="Close feature guide" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="feature-guide-search">
          <Search size={16} />
          <input
            ref={searchRef}
            aria-label="Search feature guides"
            value={query}
            placeholder="Search features, calibration, shortcuts…"
            onChange={(event) => setQuery(event.target.value)}
          />
          <span>{FEATURE_GUIDE_TOPICS.length} TOPICS</span>
        </div>

        <div className="feature-guide-body">
          <aside className="feature-guide-directory" aria-label="Feature guide topics">
            <div className="feature-guide-directory-heading"><span>FEATURE DIRECTORY</span><span>{filteredTopics.length} / {FEATURE_GUIDE_TOPICS.length}</span></div>
            <div className="feature-guide-directory-scroll scrollable">
              {categories.map((category) => (
                <section key={category} className="feature-guide-category">
                  <h3>{category}</h3>
                  {filteredTopics.filter((candidate) => candidate.category === category).map((candidate) => {
                    const Icon = TOPIC_ICONS[candidate.id] ?? BookOpen;
                    const index = FEATURE_GUIDE_TOPICS.findIndex((item) => item.id === candidate.id);
                    return (
                      <button
                        type="button"
                        key={candidate.id}
                        data-guide-topic={candidate.id}
                        className={candidate.id === topic.id ? 'active' : ''}
                        aria-current={candidate.id === topic.id ? 'page' : undefined}
                        onClick={() => chooseTopic(candidate.id)}
                      >
                        <span className="feature-guide-topic-index">{String(index + 1).padStart(2, '0')}</span>
                        <Icon size={16} />
                        <span>{candidate.title}</span>
                        {completed.has(candidate.id) && <Check size={13} className="feature-guide-topic-complete" />}
                      </button>
                    );
                  })}
                </section>
              ))}
              {!filteredTopics.length && (
                <div className="feature-guide-empty"><Search size={22} /><strong>No matching features</strong><span>Try “dome”, “trace”, “save”, or “color”.</span></div>
              )}
            </div>
            <div className="feature-guide-directory-note"><span>WORKSPACE GUIDE</span><strong>Instructions matched to this build</strong></div>
          </aside>

          <article ref={readingRef} className="feature-guide-reading scrollable">
            <header className="feature-guide-topic-header">
              <span className="eyebrow">{String(topicIndex + 1).padStart(2, '0')} / {topic.category.toUpperCase()}</span>
              <h3>{topic.title}</h3>
              <p>{topic.summary}</p>
            </header>

            <div className="feature-guide-overview">
              {topic.overview.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            <aside className="feature-guide-note">
              <strong>Good to know</strong>
              <p>{topic.note}</p>
            </aside>

            <section className="guide-walkthrough" aria-label={`${topic.title} walkthrough`}>
              <div className="guide-walkthrough-heading">
                <div><span className="eyebrow">GUIDED WALKTHROUGH</span><strong>{topic.steps.length} practical steps</strong></div>
                {(finished || stepIndex > 0) && <button type="button" className="text-button" onClick={restart}><RotateCcw size={12} />Restart</button>}
              </div>
              <div className="guide-progress" aria-hidden="true"><span style={{ width: `${(stepIndex + 1) / topic.steps.length * 100}%` }} /></div>

              <div className="guide-step-layout">
                <ol className="guide-step-list" aria-label="Walkthrough steps">
                  {topic.steps.map((item, index) => (
                    <li key={item.title}>
                      <button
                        type="button"
                        className={index === stepIndex ? 'active' : ''}
                        aria-current={index === stepIndex ? 'step' : undefined}
                        onClick={() => chooseStep(index)}
                      >
                        <span>{index < stepIndex || finished ? <Check size={11} /> : String(index + 1).padStart(2, '0')}</span>
                        <strong>{item.title}</strong>
                      </button>
                    </li>
                  ))}
                </ol>

                <div className="guide-current-step" key={`${topic.id}-${stepIndex}`} aria-live="polite">
                  <span className="eyebrow">STEP {String(stepIndex + 1).padStart(2, '0')} OF {String(topic.steps.length).padStart(2, '0')}</span>
                  <h4>{step.title}</h4>
                  <p>{step.detail}</p>
                  {step.bullets && <ul>{step.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
                  {step.action && (
                    <button type="button" className="button primary guide-open-controls" onClick={() => openControls(step.action!.target)}>
                      {step.action.label}<ArrowUpRight size={14} />
                    </button>
                  )}
                </div>
              </div>

              <footer className="guide-step-navigation">
                <button type="button" className="button subtle" disabled={stepIndex === 0} onClick={() => chooseStep(stepIndex - 1)}><ChevronLeft size={14} />Previous step</button>
                <span>Step {stepIndex + 1} of {topic.steps.length}</span>
                <button
                  type="button"
                  className="button subtle"
                  disabled={finished && stepIndex === topic.steps.length - 1}
                  onClick={() => {
                    if (stepIndex < topic.steps.length - 1) chooseStep(stepIndex + 1);
                    else setCompleted((current) => new Set(current).add(topic.id));
                  }}
                >
                  {stepIndex < topic.steps.length - 1 ? <>Next step<ChevronRight size={14} /></> : finished ? <><Check size={14} />Walkthrough complete</> : <>Complete walkthrough<Check size={14} /></>}
                </button>
              </footer>
            </section>
          </article>
        </div>
      </div>
    </div>
  );
}
