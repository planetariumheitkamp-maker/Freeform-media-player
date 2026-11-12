import { describe, expect, it } from 'vitest';
import { FEATURE_GUIDE_TOPICS } from '../../src/data/featureGuide';
import { GUIDE_TARGETS } from '../../src/lib/guideActions';

const calibration = FEATURE_GUIDE_TOPICS.find((topic) => topic.id === 'calibration');

function topicText(topic: (typeof FEATURE_GUIDE_TOPICS)[number]): string {
  return [
    topic.title,
    topic.summary,
    ...topic.overview,
    topic.note,
    ...topic.steps.flatMap((step) => [step.title, step.detail, ...(step.bullets ?? [])]),
  ].join('\n');
}

describe('interactive feature guide content', () => {
  it('provides a unique, substantive walkthrough for every major workflow', () => {
    expect(FEATURE_GUIDE_TOPICS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(FEATURE_GUIDE_TOPICS.map((topic) => topic.id)).size).toBe(FEATURE_GUIDE_TOPICS.length);
    expect(new Set(FEATURE_GUIDE_TOPICS.map((topic) => topic.title)).size).toBe(FEATURE_GUIDE_TOPICS.length);

    for (const topic of FEATURE_GUIDE_TOPICS) {
      expect(topic.id, topic.title).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(topic.category.length, topic.title).toBeGreaterThan(3);
      expect(topic.summary.length, topic.title).toBeGreaterThan(50);
      expect(topic.overview.length, topic.title).toBeGreaterThanOrEqual(2);
      expect(topic.overview.every((paragraph) => paragraph.length > 70), topic.title).toBe(true);
      expect(topic.note.length, topic.title).toBeGreaterThan(70);
      expect(topic.steps.length, topic.title).toBeGreaterThanOrEqual(5);
      expect(topic.steps.length, topic.title).toBeLessThanOrEqual(8);
      expect(new Set(topic.steps.map((step) => step.title)).size, topic.title).toBe(topic.steps.length);

      for (const step of topic.steps) {
        expect(step.title.length, `${topic.title}: ${step.title}`).toBeGreaterThan(10);
        expect(step.detail.length, `${topic.title}: ${step.title}`).toBeGreaterThan(50);
        expect(step.bullets?.length, `${topic.title}: ${step.title}`).toBeGreaterThanOrEqual(2);
        expect(step.bullets?.every((bullet) => bullet.length > 20), `${topic.title}: ${step.title}`).toBe(true);
        expect(step.action?.label.length, `${topic.title}: ${step.title}`).toBeGreaterThan(5);
        expect(GUIDE_TARGETS, `${topic.title}: ${step.title}`).toContain(step.action?.target);
      }
    }
  });

  it('routes every walkthrough action to a registered real-control destination', () => {
    const usedTargets = new Set(FEATURE_GUIDE_TOPICS.flatMap((topic) => (
      topic.steps.flatMap((step) => step.action ? [step.action.target] : [])
    )));
    expect(usedTargets).toEqual(new Set(GUIDE_TARGETS));
  });

  it('explains the actual four-parameter dome calibration contract and its limits', () => {
    expect(calibration).toBeDefined();
    expect(calibration?.steps).toHaveLength(8);
    const text = calibration ? topicText(calibration) : '';
    expect(text).toContain('At least four distinct reference directions are required');
    expect(text).toContain('Solve center, tilt & azimuth fits exactly four parameters');
    expect(text).toContain('Projection center X, Projection center Y, Dome tilt, and Grid azimuth rotation');
    expect(text).toContain('Select the lens model, FOV, truncation, circular-grid radius, and approximate center/tilt/azimuth');
    expect(text).toContain('The solver does not choose the lens model or FOV for you.');
    expect(text).toContain('output-centered pixel coordinates');
    expect(text).toContain('Freeform does not automatically detect projected markers');
    expect(text).toContain('final approval must use the actual projected output');
    expect(calibration?.steps.some((step) => step.action?.target === 'planetarium-calibration')).toBe(true);
  });
});
