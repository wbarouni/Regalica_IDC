/**
 * groupByDay — pure helper that buckets timestamped items by calendar
 * day in the user's local timezone, preserving the input order inside
 * each bucket and ordering the buckets chronologically.
 *
 * Generic over any item that carries an ISO `timestamp` string so the
 * same helper backs the chat thread (ChatMessage) and any future
 * timeline (notifications, audit log, …) without coupling the util to
 * a concrete domain type.
 *
 * Local timezone is intentional: the user reads dates in their own
 * timezone, not UTC. The Date `getFullYear/getMonth/getDate` triple
 * stays in the local TZ — not toISOString — so two messages emitted at
 * 23:30 and 23:50 local time on the same day land in the same bucket
 * even when their UTC dates differ.
 */

export interface DatedItem {
  timestamp: string;
}

export interface GroupedDay<T extends DatedItem> {
  date: Date;
  items: T[];
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function groupByDay<T extends DatedItem>(items: readonly T[]): GroupedDay<T>[] {
  if (items.length === 0) {
    return [];
  }
  const buckets = new Map<string, GroupedDay<T>>();
  const order: string[] = [];
  for (const item of items) {
    const d = new Date(item.timestamp);
    if (Number.isNaN(d.getTime())) {
      continue;
    }
    const key = dayKey(d);
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = { date: startOfDay(d), items: [] };
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.items.push(item);
  }
  // Emit the buckets in input chronological order if already sorted,
  // otherwise sort by .date asc to be deterministic regardless of
  // input ordering.
  return order.map((k) => buckets.get(k)!).sort((a, b) => a.date.getTime() - b.date.getTime());
}
