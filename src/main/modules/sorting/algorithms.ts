/**
 * 排序算法与帧记录器。
 *
 * 每个算法不直接画图，而是往 Recorder 里"录"下每一步的状态；
 * 播放器按进度取帧渲染。这样算法与渲染彻底解耦，也便于单测。
 */

export type SortKind = 'bubble' | 'insertion' | 'selection' | 'merge' | 'quick';

export const SORT_KINDS: readonly SortKind[] = ['bubble', 'insertion', 'selection', 'merge', 'quick'];

export const SORT_LABELS: Record<SortKind, string> = {
  bubble: '冒泡排序',
  insertion: '插入排序',
  selection: '选择排序',
  merge: '归并排序',
  quick: '快速排序',
};

/** 角色码：渲染层按此映射颜色，取值必须落在 0..5。 */
export const ROLE = {
  idle: 0,
  compare: 1,
  swap: 2,
  pivot: 3,
  sorted: 4,
  cursor: 5,
} as const;

export interface SortFrame {
  values: number[];
  roles: Uint8Array;
  comparisons: number;
  writes: number;
  note: string;
}

export interface SortTrace {
  kind: SortKind;
  label: string;
  input: number[];
  frames: SortFrame[];
  sorted: number[];
  comparisons: number;
  writes: number;
}

class Recorder {
  values: number[];
  roles: Uint8Array;
  private sortedFlags: Uint8Array;
  private pivotIndex = -1;
  frames: SortFrame[] = [];
  comparisons = 0;
  writes = 0;

  constructor(input: number[]) {
    this.values = [...input];
    const n = this.values.length;
    this.roles = new Uint8Array(n);
    this.sortedFlags = new Uint8Array(n);
  }

  private snapshot(note: string): void {
    const roles = this.roles.slice();
    for (let i = 0; i < roles.length; i++) {
      if (roles[i] === ROLE.idle && this.sortedFlags[i] === 1) roles[i] = ROLE.sorted;
    }
    this.frames.push({
      values: [...this.values],
      roles,
      comparisons: this.comparisons,
      writes: this.writes,
      note,
    });
  }

  markSorted(index: number, note?: string): void {
    if (index < 0 || index >= this.sortedFlags.length) return;
    this.sortedFlags[index] = 1;
    this.roles.fill(ROLE.idle);
    this.snapshot(note ?? `a[${index}] 已就位`);
  }

  compare(i: number, j: number): void {
    this.comparisons++;
    this.roles.fill(ROLE.idle);
    this.roles[i] = ROLE.compare;
    if (j !== i) this.roles[j] = j === this.pivotIndex ? ROLE.pivot : ROLE.compare;
    this.snapshot(`比较 a[${i}]=${fmt(this.values[i])} 与 a[${j}]=${fmt(this.values[j])}`);
  }

  swap(i: number, j: number): void {
    const tmp = this.values[i]!;
    this.values[i] = this.values[j]!;
    this.values[j] = tmp;
    this.writes += 2;
    if (this.pivotIndex === i) this.pivotIndex = j;
    else if (this.pivotIndex === j) this.pivotIndex = i;
    this.roles.fill(ROLE.idle);
    this.roles[i] = ROLE.swap;
    this.roles[j] = ROLE.swap;
    if (this.pivotIndex >= 0 && this.pivotIndex !== i && this.pivotIndex !== j) {
      this.roles[this.pivotIndex] = ROLE.pivot;
    }
    this.snapshot(`交换 a[${i}] 与 a[${j}]`);
  }

  write(index: number, value: number): void {
    this.values[index] = value;
    this.writes++;
    this.roles.fill(ROLE.idle);
    this.roles[index] = ROLE.swap;
    this.snapshot(`写入 a[${index}]=${fmt(value)}`);
  }

  pivot(index: number): void {
    this.pivotIndex = index;
    this.roles.fill(ROLE.idle);
    this.roles[index] = ROLE.pivot;
    this.snapshot(`选择基准 a[${index}]=${fmt(this.values[index])}`);
  }

  clearPivot(): void {
    this.pivotIndex = -1;
  }

  /** 只更新高亮、不产生帧：用于连续比较之间保留语境。 */
  touch(i: number, role: number): void {
    if (i >= 0 && i < this.roles.length) this.roles[i] = role;
  }

  finish(): number[] {
    for (let i = 0; i < this.sortedFlags.length; i++) this.sortedFlags[i] = 1;
    this.roles.fill(ROLE.idle);
    this.snapshot('排序完成');
    return [...this.values];
  }
}

function fmt(v: number | undefined): string {
  return v === undefined ? '·' : String(Math.round(v * 100) / 100);
}

function bubble(rec: Recorder): void {
  const n = rec.values.length;
  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    for (let j = 0; j < n - 1 - i; j++) {
      rec.compare(j, j + 1);
      if (rec.values[j]! > rec.values[j + 1]!) {
        rec.swap(j, j + 1);
        swapped = true;
      }
    }
    rec.markSorted(n - 1 - i);
    if (!swapped) {
      for (let k = 0; k < n - 1 - i; k++) rec.markSorted(k);
      break;
    }
  }
  if (n > 0) rec.markSorted(0);
}

function insertion(rec: Recorder): void {
  const n = rec.values.length;
  for (let i = 1; i < n; i++) {
    let j = i;
    while (j > 0) {
      rec.compare(j - 1, j);
      if (rec.values[j - 1]! > rec.values[j]!) {
        rec.swap(j - 1, j);
        j--;
      } else {
        break;
      }
    }
  }
  for (let i = 0; i < n; i++) rec.markSorted(i, `a[${i}] 已就位`);
}

function selection(rec: Recorder): void {
  const n = rec.values.length;
  for (let i = 0; i < n - 1; i++) {
    let min = i;
    for (let j = i + 1; j < n; j++) {
      rec.touch(min, ROLE.cursor);
      rec.compare(j, min);
      if (rec.values[j]! < rec.values[min]!) min = j;
    }
    if (min !== i) rec.swap(i, min);
    rec.markSorted(i);
  }
  if (n > 0) rec.markSorted(n - 1);
}

function mergeSortRange(rec: Recorder, lo: number, hi: number, buf: number[]): void {
  if (hi - lo < 2) return;
  const mid = (lo + hi) >> 1;
  mergeSortRange(rec, lo, mid, buf);
  mergeSortRange(rec, mid, hi, buf);

  for (let k = lo; k < hi; k++) buf[k] = rec.values[k]!;
  let i = lo;
  let j = mid;
  for (let k = lo; k < hi; k++) {
    if (i >= mid) {
      rec.write(k, buf[j]!);
      j++;
    } else if (j >= hi) {
      rec.write(k, buf[i]!);
      i++;
    } else {
      rec.compare(i, j);
      if (buf[i]! <= buf[j]!) {
        rec.write(k, buf[i]!);
        i++;
      } else {
        rec.write(k, buf[j]!);
        j++;
      }
    }
  }
}

function merge(rec: Recorder): void {
  const buf = new Array<number>(rec.values.length).fill(0);
  mergeSortRange(rec, 0, rec.values.length, buf);
  for (let i = 0; i < rec.values.length; i++) rec.markSorted(i, `a[${i}] 已就位`);
}

function quickSortRange(rec: Recorder, lo: number, hi: number): void {
  if (lo >= hi) return;
  const pivotValue = rec.values[hi]!;
  rec.pivot(hi);
  let store = lo;
  for (let i = lo; i < hi; i++) {
    rec.compare(i, hi);
    if (rec.values[i]! < pivotValue) {
      if (i !== store) rec.swap(i, store);
      store++;
    }
  }
  if (store !== hi) rec.swap(store, hi);
  rec.markSorted(store, `a[${store}] 已就位`);
  rec.clearPivot();
  quickSortRange(rec, lo, store - 1);
  quickSortRange(rec, store + 1, hi);
}

function quick(rec: Recorder): void {
  quickSortRange(rec, 0, rec.values.length - 1);
  for (let i = 0; i < rec.values.length; i++) rec.markSorted(i, `a[${i}] 已就位`);
}

/**
 * 录制一次完整排序过程。
 * @throws 未知算法时抛出 `未知排序算法: <kind>`
 */
export function runSort(kind: SortKind, input: readonly number[]): SortTrace {
  const runner = {
    bubble,
    insertion,
    selection,
    merge,
    quick,
  }[kind];

  if (!runner) throw new Error(`未知排序算法: ${String(kind)}`);

  const rec = new Recorder([...input]);
  rec.frames.push({
    values: [...rec.values],
    roles: new Uint8Array(rec.values.length),
    comparisons: 0,
    writes: 0,
    note: '初始状态',
  });

  runner(rec);
  const sorted = rec.finish();

  return {
    kind,
    label: SORT_LABELS[kind],
    input: [...input],
    frames: rec.frames,
    sorted,
    comparisons: rec.comparisons,
    writes: rec.writes,
  };
}
