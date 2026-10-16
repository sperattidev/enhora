import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './ui';

describe('Button', () => {
  it('lets className override the variant defaults', () => {
    render(
      <Button variant="ghost" className="min-h-9 text-red-700">
        Quitar
      </Button>,
    );
    const cls = screen.getByRole('button', { name: 'Quitar' }).className;
    expect(cls).toContain('text-red-700');
    expect(cls).not.toContain('text-slate-700');
    expect(cls).toContain('min-h-9');
    expect(cls).not.toContain('min-h-11');
  });
});
