import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Paged from '../Paged';

const items = Array.from({ length: 40 }, (_, i) => ({ id: i + 1 }));

test('shows 15 per page and moves between pages', () => {
  render(<ul><Paged items={items}>{(rows) => rows.map((r) => <li key={r.id}>item {r.id}</li>)}</Paged></ul>);
  expect(screen.getAllByRole('listitem')).toHaveLength(15);
  expect(screen.getByText('1–15 of 40')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Next page'));
  expect(screen.getByText('item 16')).toBeInTheDocument();
  expect(screen.queryByText('item 15')).toBeNull();
  fireEvent.click(screen.getByText('3'));
  expect(screen.getAllByRole('listitem')).toHaveLength(10);
  expect(screen.getByText('31–40 of 40')).toBeInTheDocument();
  expect(screen.getByLabelText('Next page')).toBeDisabled();
});

test('short lists render unchanged, with no pager', () => {
  render(<ul><Paged items={items.slice(0, 15)}>{(rows) => rows.map((r) => <li key={r.id}>item {r.id}</li>)}</Paged></ul>);
  expect(screen.getAllByRole('listitem')).toHaveLength(15);
  expect(screen.queryByLabelText('Pages')).toBeNull();
});

test('inside a table the pager is a full-width row, and a shrinking list goes back to page 1', () => {
  const T = ({ list }) => <table><tbody><Paged items={list} table>{(rows) => rows.map((r) => <tr key={r.id}><td>row {r.id}</td></tr>)}</Paged></tbody></table>;
  const { rerender } = render(<T list={items} />);
  expect(screen.getAllByRole('row')).toHaveLength(16);
  fireEvent.click(screen.getByText('3'));
  expect(screen.getByText('row 31')).toBeInTheDocument();
  rerender(<T list={items.slice(0, 20)} />);
  expect(screen.getByText('row 1')).toBeInTheDocument();
});
