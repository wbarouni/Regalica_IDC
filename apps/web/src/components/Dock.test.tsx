import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dock } from './Dock';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function fileWithType(name: string, type: string): File {
  return new File(['<xml/>'], name, { type });
}

describe('<Dock>', () => {
  it('renders the .dock shell with composer + tools + hint row', () => {
    const { container } = render(<Dock onSend={() => {}} />);
    expect(container.querySelector('.dock')).not.toBeNull();
    expect(container.querySelector('.dock__composer')).not.toBeNull();
    expect(container.querySelector('.dock__field')).not.toBeNull();
    expect(container.querySelector('.dock__tools')).not.toBeNull();
    expect(container.querySelector('.dock__send')).not.toBeNull();
    expect(container.querySelector('.dock__hint-row')).not.toBeNull();
  });

  it('reads its placeholder from the i18n key dock.placeholder', () => {
    render(<Dock onSend={() => {}} />);
    expect(screen.getByPlaceholderText('dock.placeholder')).toBeInTheDocument();
  });

  it('disables the send button when the textarea is empty', () => {
    render(<Dock onSend={() => {}} />);
    const send = screen.getByTestId('dock-send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it('enables the send button once the textarea has non-whitespace text', () => {
    const { container } = render(<Dock onSend={() => {}} />);
    const ta = container.querySelector('.dock__field') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'hello' } });
    const send = screen.getByTestId('dock-send') as HTMLButtonElement;
    expect(send.disabled).toBe(false);
  });

  it('invokes onSend with the trimmed text and clears the field on click', () => {
    const onSend = vi.fn();
    const { container } = render(<Dock onSend={onSend} />);
    const ta = container.querySelector('.dock__field') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '  hi  ' } });
    fireEvent.click(screen.getByTestId('dock-send'));
    expect(onSend).toHaveBeenCalledWith('hi');
    expect(ta.value).toBe('');
  });

  it('invokes onSend on Enter (no Shift)', () => {
    const onSend = vi.fn();
    const { container } = render(<Dock onSend={onSend} />);
    const ta = container.querySelector('.dock__field') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'hi' } });
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('hi');
  });

  it('does NOT send on Shift+Enter (insert newline)', () => {
    const onSend = vi.fn();
    const { container } = render(<Dock onSend={onSend} />);
    const ta = container.querySelector('.dock__field') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'hi' } });
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('blocks send when loading=true', () => {
    const onSend = vi.fn();
    const { container } = render(<Dock onSend={onSend} loading={true} />);
    const ta = container.querySelector('.dock__field') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'hi' } });
    fireEvent.click(screen.getByTestId('dock-send'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('renders both hint keys in the .dock__hint-row', () => {
    render(<Dock onSend={() => {}} />);
    expect(screen.getByText('dock.hint_send')).toBeInTheDocument();
    expect(screen.getByText('dock.hint_newline')).toBeInTheDocument();
  });

  it('mic button is aria-disabled and never fires', () => {
    render(<Dock onSend={() => {}} />);
    const mic = screen.getByTestId('dock-mic') as HTMLButtonElement;
    expect(mic.getAttribute('aria-disabled')).toBe('true');
    expect(mic.disabled).toBe(true);
  });

  it('attach click triggers a hidden file input', () => {
    const { container } = render(<Dock onSend={() => {}} />);
    const fileInput = container.querySelector(
      '[data-testid="dock-file-input"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');
    fireEvent.click(screen.getByTestId('dock-attach'));
    expect(clickSpy).toHaveBeenCalled();
  });

  it('accepts an .xml file with application/xml MIME and calls onFileSelect', () => {
    const onFileSelect = vi.fn();
    render(<Dock onSend={() => {}} onFileSelect={onFileSelect} />);
    const fileInput = screen.getByTestId('dock-file-input') as HTMLInputElement;
    const file = fileWithType('rsm630.xml', 'application/xml');
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  it('accepts an .xml file by extension when MIME is missing', () => {
    const onFileSelect = vi.fn();
    render(<Dock onSend={() => {}} onFileSelect={onFileSelect} />);
    const fileInput = screen.getByTestId('dock-file-input') as HTMLInputElement;
    const file = fileWithType('rsm630.xml', '');
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  it('rejects a non-xml file and surfaces error.invalid_xml_format', () => {
    const onFileSelect = vi.fn();
    render(<Dock onSend={() => {}} onFileSelect={onFileSelect} />);
    const fileInput = screen.getByTestId('dock-file-input') as HTMLInputElement;
    const file = fileWithType('photo.png', 'image/png');
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onFileSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('error.invalid_xml_format');
  });

  it('drag-and-drop on .dock validates files the same way as attach', () => {
    const onFileSelect = vi.fn();
    const { container } = render(<Dock onSend={() => {}} onFileSelect={onFileSelect} />);
    const dock = container.querySelector('.dock') as HTMLDivElement;
    const file = fileWithType('rsm630.xml', 'text/xml');
    const dt = {
      files: [file],
      dropEffect: '',
    };
    fireEvent.dragOver(dock, { dataTransfer: dt });
    fireEvent.drop(dock, { dataTransfer: dt });
    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  it('renders a custom suggestions slot above the composer', () => {
    render(<Dock onSend={() => {}} suggestions={<div data-testid="my-chips">chips</div>} />);
    expect(screen.getByTestId('my-chips')).toBeInTheDocument();
  });

  // K2 — PDF download trigger button.
  it('K2 — hides the PDF download button when onDownloadReport is undefined', () => {
    render(<Dock onSend={() => {}} />);
    expect(screen.queryByTestId('dock-download-pdf')).toBeNull();
  });

  it('K2 — shows the PDF download button when onDownloadReport is provided', () => {
    const onDownloadReport = vi.fn();
    render(<Dock onSend={() => {}} onDownloadReport={onDownloadReport} />);
    const btn = screen.getByTestId('dock-download-pdf');
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute('title');
  });

  it('K2 — invokes onDownloadReport when clicked', () => {
    const onDownloadReport = vi.fn();
    render(<Dock onSend={() => {}} onDownloadReport={onDownloadReport} />);
    fireEvent.click(screen.getByTestId('dock-download-pdf'));
    expect(onDownloadReport).toHaveBeenCalledTimes(1);
  });

  it('K2 — disables the PDF download button while loading', () => {
    const onDownloadReport = vi.fn();
    render(<Dock onSend={() => {}} loading onDownloadReport={onDownloadReport} />);
    expect(screen.getByTestId('dock-download-pdf')).toBeDisabled();
  });
});
