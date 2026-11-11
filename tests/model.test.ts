import { describe, expect, it } from 'vitest';
import {
  AreaIndex, canMoveRoom, ck, components, createProject, edgeOf, lineCells, moveRoom, normalizeArea,
  roomAnchor, shiftArea, validateProject, Project, Room,
} from '../src/model';

function setup(cells: string[][]): Project {
  const p = createProject();
  const a = p.areas[0];
  cells.forEach((cs, i) => a.rooms.push({ id: `R${100 + i}`, name: '', color: '#000000', notes: '', cells: cs }));
  return p;
}

describe('lineCells', () => {
  it('produces 4-connected steps ending at the target', () => {
    const pts = lineCells(0, 0, 5, 3);
    expect(pts.at(-1)).toEqual([5, 3]);
    expect(pts.length).toBe(8);
    let prev = [0, 0];
    for (const p of pts) {
      expect(Math.abs(p[0] - prev[0]) + Math.abs(p[1] - prev[1])).toBe(1);
      prev = p;
    }
  });
  it('handles straight and reverse lines', () => {
    expect(lineCells(3, 2, 3, 0)).toEqual([[3, 1], [3, 0]]);
    expect(lineCells(2, 0, 0, 0)).toEqual([[1, 0], [0, 0]]);
    expect(lineCells(1, 1, 1, 1)).toEqual([]);
  });
});

describe('components', () => {
  it('splits by 4-connectivity, largest first', () => {
    const c = components(['0,0', '1,0', '5,5', '2,0', '1,1']);
    expect(c.map((x) => x.length)).toEqual([4, 1]);
  });
  it('treats diagonal cells as separate', () => {
    expect(components(['0,0', '1,1']).length).toBe(2);
  });
});

describe('normalizeArea', () => {
  it('splits a disconnected room into new rooms with fresh ids', () => {
    const p = setup([['0,0', '1,0', '2,0', '9,9']]);
    const a = p.areas[0];
    a.rooms[0].name = 'Hall';
    normalizeArea(p, a);
    expect(a.rooms.length).toBe(2);
    expect(a.rooms[0].id).toBe('R100');
    expect(a.rooms[0].name).toBe('Hall');
    expect(a.rooms[0].cells.length).toBe(3);
    expect(a.rooms[1].id).not.toBe('R100');
    expect(a.rooms[1].cells).toEqual(['9,9']);
  });
  it('drops doors that are no longer on a wall', () => {
    const p = setup([['0,0', '1,0']]);
    const a = p.areas[0];
    a.doors.push({ edge: edgeOf(0, 0, 'e'), type: 'door' }); // interior edge
    a.doors.push({ edge: edgeOf(0, 0, 'w'), type: 'door' }); // exterior wall
    normalizeArea(p, a);
    expect(a.doors.map((d) => d.edge)).toEqual([edgeOf(0, 0, 'w')]);
  });
  it('keeps doors between two adjacent rooms', () => {
    const p = setup([['0,0'], ['1,0']]);
    const a = p.areas[0];
    a.doors.push({ edge: edgeOf(0, 0, 'e'), type: 'red' });
    normalizeArea(p, a);
    expect(a.doors.length).toBe(1);
  });
  it('removes empty rooms and out-of-bounds cells', () => {
    const p = setup([[], ['-1,0', '0,0']]);
    const a = p.areas[0];
    normalizeArea(p, a);
    expect(a.rooms.length).toBe(1);
    expect(a.rooms[0].cells).toEqual(['0,0']);
  });
});

describe('AreaIndex', () => {
  it('detects adjacency and walls', () => {
    const p = setup([['2,2', '3,2']]);
    const idx = new AreaIndex(p.areas[0]);
    const r = p.areas[0].rooms[0];
    expect(idx.adjacentTo(r, 4, 2)).toBe(true);
    expect(idx.adjacentTo(r, 4, 3)).toBe(false);
    expect(idx.isWall(edgeOf(2, 2, 'e'))).toBe(false);
    expect(idx.isWall(edgeOf(2, 2, 'n'))).toBe(true);
  });
});

describe('moveRoom', () => {
  it('carries doors and markers, and is blocked by other rooms', () => {
    const p = setup([['0,0', '1,0'], ['5,0']]);
    const a = p.areas[0];
    const r = a.rooms[0] as Room;
    a.doors.push({ edge: edgeOf(0, 0, 'w'), type: 'door' });
    a.markers.push({ id: 'M1', x: 1, y: 0, icon: 'save', color: '#fff' });
    const idx = new AreaIndex(a);
    expect(canMoveRoom(a, idx, r, 4, 0)).toBe(false);
    expect(canMoveRoom(a, idx, r, 0, 2)).toBe(true);
    moveRoom(a, r, 0, 2);
    expect(r.cells).toEqual(['0,2', '1,2']);
    expect(a.doors[0].edge).toBe(edgeOf(0, 2, 'w'));
    expect(a.markers[0]).toMatchObject({ x: 1, y: 2 });
  });
});

describe('shiftArea', () => {
  it('drops content pushed out of bounds after normalising', () => {
    const p = setup([['0,0', '1,0']]);
    const a = p.areas[0];
    shiftArea(a, -1, 0);
    normalizeArea(p, a);
    expect(a.rooms[0].cells).toEqual(['0,0']);
  });
});

describe('roomAnchor', () => {
  it('uses the centroid for convex rooms and a cell centre for L-shapes', () => {
    expect(roomAnchor({ id: 'R1', name: '', color: '', notes: '', cells: ['0,0', '1,0', '0,1', '1,1'] })).toEqual([1, 1]);
    const [x, y] = roomAnchor({ id: 'R1', name: '', color: '', notes: '', cells: ['0,0', '0,1', '0,2', '1,2', '2,2'] });
    expect(['0,0', '0,1', '0,2', '1,2', '2,2']).toContain(ck(Math.floor(x), Math.floor(y)));
  });
});

describe('validateProject', () => {
  it('round-trips and bumps nextId past existing ids', () => {
    const p = setup([['0,0']]);
    p.nextId = 1;
    const back = validateProject(JSON.parse(JSON.stringify(p)));
    expect(back.nextId).toBeGreaterThan(100);
    expect(back.areas[0].rooms[0].cells).toEqual(['0,0']);
  });
  it('rejects other JSON', () => {
    expect(() => validateProject({ hello: 1 })).toThrow();
  });
});
