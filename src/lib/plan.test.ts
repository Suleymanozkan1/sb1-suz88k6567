import { describe, expect, it } from 'vitest';
import { sortTasks, vendorCostTotal } from './plan';
import type { EventTask } from '../types';

describe('iş emri sıralaması', () => {
  const gorev = (id: string, atTime: string): EventTask =>
    ({ id, reservationId: 'r1', atTime, title: id, responsible: '', done: false });

  it('saate göre sıralar', () => {
    expect(sortTasks([gorev('c', '21:30'), gorev('a', '17:00'), gorev('b', '19:00')]).map((t) => t.id))
      .toEqual(['a', 'b', 'c']);
  });

  it('aynı saatte ekleme sırasını korur', () => {
    expect(sortTasks([gorev('x', '18:00'), gorev('y', '18:00')]).map((t) => t.id)).toEqual(['x', 'y']);
  });
});

describe('tedarikçi maliyeti', () => {
  it('atamaların maliyetini toplar', () => {
    expect(vendorCostTotal([
      { id: '1', reservationId: 'r1', vendorId: 'v1', cost: 15000, note: '' },
      { id: '2', reservationId: 'r1', vendorId: 'v2', cost: 8500, note: '' },
    ])).toBe(23500);
  });

  it('atama yokken sıfır döner', () => {
    expect(vendorCostTotal([])).toBe(0);
  });
});
