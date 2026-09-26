// BUNDLED-COPY: 0.12.7
// ColumnFollower.cs — BUNDLED RESOURCE (the VB twin is resources/ColumnFollower.vb). Copied into
// every generated project, next to AnchorHelper.cs / ExifImageLoader.cs.
//
// A live, read-only view of ONE COLUMN of a table that a DataGrid is bound to.
//
// Why it exists: a control that only DISPLAYS data (ComboBox / ListBox / ItemsControl) can't own a
// DataSet table — the editable DataGrid owns it (it holds the row collection the "+ Add row…"
// placeholder, the live add/edit/delete and the undo/redo work on). Such a control can still FOLLOW
// that collection: point its ItemsSource at a ColumnFollower built from the grid's rows and it stays
// in step with the grid:
//   * a row added, removed or edited in the grid updates this list;
//   * the grid's "+ Add row…" placeholder row is skipped;
//   * the grid's row order is kept;
//   * a changed cell is replaced IN PLACE, so the control keeps its selected item.
//
// The designer writes the binding for you (Properties → Items Source → a "follows <grid>" column):
//   ComboBox2.ItemsSource = new ColumnFollower<CustomersRow, string>(
//       _customers, r => r.Name, r => r.IsPlaceholder);
//
// NOTE: a control may not have BOTH inline items and an ItemsSource — Avalonia throws
// "Items collection must be empty before using ItemsSource." The designer clears the inline items
// when you bind a column (asking first).
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.ComponentModel;

/// <summary>
/// Mirrors one column of a bound table's row collection as a live
/// <see cref="ObservableCollection{TValue}"/> — bind a read-only control's ItemsSource to it.
/// </summary>
/// <typeparam name="TRow">The table's generated row type (e.g. CustomersRow).</typeparam>
/// <typeparam name="TValue">The column's type (string for a text column).</typeparam>
public class ColumnFollower<TRow, TValue> : ObservableCollection<TValue>
{
    private readonly ObservableCollection<TRow> _rows;
    private readonly Func<TRow, TValue> _select;
    private readonly Func<TRow, bool> _skip;
    /// <summary>The rows this list is built from, in list order — skipped rows are absent.</summary>
    private readonly List<TRow> _mirror = new List<TRow>();

    /// <param name="rows">The row collection the DataGrid shows (e.g. _customers).</param>
    /// <param name="select">Reads the column's value from a row, e.g. <c>r =&gt; r.Name</c>.</param>
    /// <param name="skip">Rows to leave out — pass <c>r =&gt; r.IsPlaceholder</c> to hide the grid's
    /// "+ Add row…" row.</param>
    public ColumnFollower(ObservableCollection<TRow> rows, Func<TRow, TValue> select, Func<TRow, bool> skip)
    {
        if (rows == null) throw new ArgumentNullException(nameof(rows));
        if (select == null) throw new ArgumentNullException(nameof(select));
        _rows = rows;
        _select = select;
        _skip = skip;
        Mirror();
        _rows.CollectionChanged += OnRowsChanged;
    }

    private bool Skipped(TRow row)
    {
        if (row == null) return true;
        if (_skip == null) return false;
        return _skip(row);
    }

    /// <summary>Rebuilds the whole list from the row collection (initial load, and after a
    /// Reset/Replace/Move, which are rare).</summary>
    private void Mirror()
    {
        foreach (var r in _mirror) Unwatch(r);
        _mirror.Clear();
        base.ClearItems();
        foreach (var r in _rows)
        {
            if (Skipped(r)) continue;
            _mirror.Add(r);
            base.InsertItem(_mirror.Count - 1, _select(r));
            Watch(r);
        }
    }

    /// <summary>Keeps the list in step with the grid: new rows are inserted at their position,
    /// deleted rows removed (so the control's selection is preserved for the others).</summary>
    private void OnRowsChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        switch (e.Action)
        {
            case NotifyCollectionChangedAction.Add:
                {
                    var row = (TRow)e.NewItems![0]!;
                    if (Skipped(row)) return;
                    var at = e.NewStartingIndex >= 0 ? e.NewStartingIndex : _rows.Count;
                    var index = MirrorIndex(at);
                    _mirror.Insert(index, row);
                    base.InsertItem(index, _select(row));
                    Watch(row);
                    break;
                }
            case NotifyCollectionChangedAction.Remove:
                {
                    foreach (var item in e.OldItems!)
                    {
                        var row = (TRow)item!;
                        var index = _mirror.IndexOf(row);
                        if (index < 0) continue;
                        Unwatch(row);
                        _mirror.RemoveAt(index);
                        base.RemoveItem(index);
                    }
                    break;
                }
            default:
                // Replace / Move / Reset (a whole-collection swap) — rebuild; keeps the code tiny.
                Mirror();
                break;
        }
    }

    /// <summary>The list index of the row at <paramref name="rowIndex"/> in the row collection.</summary>
    private int MirrorIndex(int rowIndex)
    {
        var count = 0;
        var limit = Math.Min(rowIndex, _rows.Count);
        for (var i = 0; i < limit; i++)
        {
            if (!Skipped(_rows[i])) count++;
        }
        return count;
    }

    private void Watch(TRow row)
    {
        if (row is INotifyPropertyChanged source) source.PropertyChanged += OnRowChanged;
    }

    private void Unwatch(TRow row)
    {
        if (row is INotifyPropertyChanged source) source.PropertyChanged -= OnRowChanged;
    }

    /// <summary>A cell of a mirrored row changed: rewrite just that entry in place, so the control
    /// keeps its selected item.</summary>
    private void OnRowChanged(object? sender, PropertyChangedEventArgs e)
    {
        var row = (TRow)sender!;
        var index = _mirror.IndexOf(row);
        if (index < 0) return;
        var value = _select(row);
        if (!EqualityComparer<TValue>.Default.Equals(this[index], value)) base.SetItem(index, value);
    }
}
