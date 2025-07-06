"use client";

import * as React from 'react';
import { useState, useMemo } from 'react';
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender, ColumnDef, SortingState } from '@tanstack/react-table';
import type { TimelineEntry } from '../lib/timeline-data';

interface TimelineTableProps {
  entries: TimelineEntry[];
}

export default function TimelineTable({ entries }: TimelineTableProps) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const data = useMemo(() => {
    if (!globalFilter) return entries;
    const filter = globalFilter.toLowerCase();
    return entries.filter(e =>
      e.title.toLowerCase().includes(filter) ||
      e.slug.toLowerCase().includes(filter)
    );
  }, [entries, globalFilter]);

  const columns = useMemo<ColumnDef<TimelineEntry, any>[]>(() => [
    {
      header: 'Title',
      accessorKey: 'title',
      cell: info => info.getValue(),
    },
    {
      header: 'Slug',
      accessorKey: 'slug',
      cell: info => info.getValue(),
    },
    {
      header: 'Created',
      accessorKey: 'created',
      cell: info => new Date(info.getValue()).toLocaleString(),
    },
    {
      header: 'Modified',
      accessorKey: 'modified',
      cell: info => new Date(info.getValue()).toLocaleString(),
    },
    {
      header: 'Actions',
      id: 'actions',
      cell: ({ row }) => {
        const slug = row.original.slug;
        return (
          <div className="flex gap-2">
            <a href={`/keystatic/branch/main/collection/timeline/item/${slug}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Edit</a>
            <a href={`/api/preview/timeline/${slug}`} target="_blank" rel="noopener noreferrer" className="text-yellow-600 underline">Preview</a>
            <a href={`/timeline/${slug}`} target="_blank" rel="noopener noreferrer" className="text-green-600 underline">Live</a>
          </div>
        );
      },
    },
  ], []);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: false,
  });

  return (
    <div className="bg-white rounded-lg shadow border p-4">
      <div className="flex justify-between items-center mb-4">
        <input
          type="text"
          placeholder="Search by title or slug..."
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          className="border rounded px-3 py-2 w-64"
        />
        <a
          href="/keystatic/branch/main/collection/timeline/create"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-semibold"
        >
          New Entry
        </a>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    className="px-4 py-2 text-left cursor-pointer select-none"
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === 'asc' && ' ▲'}
                    {header.column.getIsSorted() === 'desc' && ' ▼'}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="border-t">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-4 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 