import { TestStep } from '../types';

/** Human-readable line for live execution logs */
export function formatStepActivity(step: TestStep, websiteUrl: string, phase: 'start' | 'done' = 'start'): string {
  if (phase === 'done') {
    return step.description?.trim() ? `Completed: ${step.description}` : `Completed ${step.action} step`;
  }

  if (step.description?.trim()) {
    return step.description.trim();
  }

  switch (step.action) {
    case 'navigate':
      return `Navigating to ${step.value || websiteUrl}`;
    case 'click':
      return `Clicking "${step.selector || 'element'}"`;
    case 'fill':
      return `Filling "${step.selector || 'input field'}"`;
    case 'hover':
      return `Hovering over "${step.selector || 'element'}"`;
    case 'press':
      return `Pressing "${step.value || 'Enter'}" on "${step.selector || 'element'}"`;
    case 'assert':
      return step.assertion
        ? `Asserting ${step.assertion.type}${step.selector ? ` on "${step.selector}"` : ''}`
        : 'Running assertion';
    case 'screenshot':
      return 'Capturing screenshot';
    case 'wait':
      return `Waiting ${step.value || '1000'}ms`;
    case 'drag':
      return `Dragging "${step.selector}" to "${step.value || 'target'}"`;
    case 'upload':
      return `Uploading file to "${step.selector || 'input'}"`;
    case 'download':
      return `Downloading via "${step.selector || 'element'}"`;
    default:
      return `Running ${step.action}`;
  }
}
