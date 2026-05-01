import { describe, expect, it } from 'vitest';

import { groupByDay, type DatedItem } from './groupByDay';

interface Msg extends DatedItem {
  id: string;
}

function msg(id: string, ts: string): Msg {
  return { id, timestamp: ts };
}

describe('groupByDay', () => {
  it('returns an empty array for empty input', () => {
    expect(groupByDay([])).toEqual([]);
  });

  it('buckets items emitted on the same local day into one group', () => {
    const items: Msg[] = [
      msg('a', '2026-04-30T08:00:00Z'),
      msg('b', '2026-04-30T15:30:00Z'),
      msg('c', '2026-04-30T22:45:00Z'),
    ];
    const groups = groupByDay(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('splits items emitted on different local days into separate buckets', () => {
    const items: Msg[] = [
      msg('a', '2026-04-29T10:00:00Z'),
      msg('b', '2026-04-30T10:00:00Z'),
      msg('c', '2026-05-01T10:00:00Z'),
    ];
    const groups = groupByDay(items);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.items[0]!.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns groups sorted chronologically even with shuffled input', () => {
    const items: Msg[] = [
      msg('newer', '2026-05-02T10:00:00Z'),
      msg('older', '2026-04-30T10:00:00Z'),
      msg('middle', '2026-05-01T10:00:00Z'),
    ];
    const groups = groupByDay(items);
    const dates = groups.map((g) => g.date.getTime());
    expect(dates[0]).toBeLessThan(dates[1]!);
    expect(dates[1]).toBeLessThan(dates[2]!);
  });

  it('exposes the day-start Date in the local timezone', () => {
    const groups = groupByDay([msg('a', '2026-04-30T15:00:00Z')]);
    const d = groups[0]!.date;
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  it('preserves intra-day input order', () => {
    const items: Msg[] = [
      msg('first', '2026-04-30T08:00:00Z'),
      msg('second', '2026-04-30T09:00:00Z'),
      msg('third', '2026-04-30T10:00:00Z'),
    ];
    const groups = groupByDay(items);
    expect(groups[0]!.items.map((m) => m.id)).toEqual(['first', 'second', 'third']);
  });

  it('skips items with an unparseable timestamp', () => {
    const items: Msg[] = [
      msg('a', '2026-04-30T08:00:00Z'),
      msg('garbage', 'not-a-date'),
      msg('b', '2026-04-30T09:00:00Z'),
    ];
    const groups = groupByDay(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('handles items at local midnight without merging across the day boundary', () => {
    // 23:30 and 00:30 the next day in local TZ — must be two buckets.
    const localTz = -new Date().getTimezoneOffset() / 60;
    const tzSign = localTz >= 0 ? '+' : '-';
    const tzAbs = Math.abs(localTz).toString().padStart(2, '0');
    const items: Msg[] = [
      msg('late', `2026-04-30T23:30:00${tzSign}${tzAbs}:00`),
      msg('next', `2026-05-01T00:30:00${tzSign}${tzAbs}:00`),
    ];
    const groups = groupByDay(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.items[0]!.id).toBe('late');
    expect(groups[1]!.items[0]!.id).toBe('next');
  });
});
