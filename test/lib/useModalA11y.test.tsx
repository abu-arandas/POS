import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { useModalA11y } from '../../src/lib/useModalA11y';

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useModalA11y<HTMLDivElement>(open, () => {
    onClose();
    setOpen(false);
  });
  return (
    <div>
      <button onClick={() => setOpen(true)}>opener</button>
      {open && (
        <div ref={ref} role="dialog" aria-modal="true" aria-label="Test dialog" tabIndex={-1}>
          <button>first</button>
          <button>middle</button>
          <button>last</button>
        </div>
      )}
    </div>
  );
}

function AutofocusHarness() {
  const [open, setOpen] = useState(true);
  const ref = useModalA11y<HTMLDivElement>(open, () => setOpen(false));
  return open ? (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Autofocus dialog" tabIndex={-1}>
      <button>before</button>
      <input aria-label="wanted" data-autofocus />
    </div>
  ) : null;
}

describe('useModalA11y', () => {
  it('moves focus to the first focusable element when the dialog opens', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('opener'));
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('prefers an element marked data-autofocus for initial focus', () => {
    render(<AutofocusHarness />);
    expect(screen.getByLabelText('wanted')).toHaveFocus();
  });

  it('wraps Tab from the last element back to the first', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('opener'));
    screen.getByText('last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('wraps Shift+Tab from the first element back to the last', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('opener'));
    screen.getByText('first').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByText('last')).toHaveFocus();
  });

  it('pulls focus back inside when focus escapes the dialog', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('opener'));
    screen.getByText('opener').focus(); // simulate focus escaping the trap
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByText('first')).toHaveFocus();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByText('opener'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the previously focused element when the dialog closes', () => {
    render(<Harness />);
    const opener = screen.getByText('opener');
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByText('first')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('does not listen for keys once the dialog is closed', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByText('opener'));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
