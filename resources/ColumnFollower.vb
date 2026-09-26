' BUNDLED-COPY: 0.12.13
' ColumnFollower.vb — BUNDLED RESOURCE (the C# twin is resources/ColumnFollower.cs). Copied into
' every generated project, next to AnchorHelper.vb / ExifImageLoader.vb.
'
' A live, read-only view of ONE COLUMN of a table that a DataGrid is bound to.
'
' Why it exists: a control that only DISPLAYS data (ComboBox / ListBox / ItemsControl) can't own a
' DataSet table — the editable DataGrid owns it (it holds the row collection the "+ Add row…"
' placeholder, the live add/edit/delete and the undo/redo work on). Such a control can still FOLLOW
' that collection: point its ItemsSource at a ColumnFollower built from the grid's rows and it stays
' in step with the grid:
'   * a row added, removed or edited in the grid updates this list;
'   * the grid's "+ Add row…" placeholder row is skipped;
'   * the grid's row order is kept;
'   * a changed cell is replaced IN PLACE, so the control keeps its selected item.
'
' The designer writes the binding for you (Properties → Items Source → a "follows <grid>" column):
'   ComboBox2.ItemsSource = New ColumnFollower(Of CustomersRow, String)(
'       _customers, Function(r) r.Name, Function(r) r.IsPlaceholder)
'
' NOTE: a control may not have BOTH inline <ComboBoxItem> children and an ItemsSource — Avalonia
' throws "Items collection must be empty before using ItemsSource." The designer clears the inline
' items when you bind a column (asking first).
Imports System
Imports System.Collections.Generic
Imports System.Collections.ObjectModel
Imports System.Collections.Specialized
Imports System.ComponentModel

''' <summary>
''' Mirrors one column of a bound table's row collection as a live observable collection of that
''' column's values — bind a read-only control's ItemsSource to it.
''' </summary>
''' <typeparam name="TRow">The table's generated row type (e.g. CustomersRow).</typeparam>
''' <typeparam name="TValue">The column's type (String for a text column).</typeparam>
Friend Class ColumnFollower(Of TRow, TValue)
    Inherits ObservableCollection(Of TValue)

    Private ReadOnly _rows As ObservableCollection(Of TRow)
    Private ReadOnly _select As Func(Of TRow, TValue)
    Private ReadOnly _skip As Func(Of TRow, Boolean)
    ''' <summary>The rows this list is built from, in list order — skipped rows are absent.</summary>
    Private ReadOnly _mirror As New List(Of TRow)()

    ''' <param name="rows">The row collection the DataGrid shows (e.g. _customers).</param>
    ''' <param name="selector">Reads the column's value from a row, e.g. <c>Function(r) r.Name</c>.
    ''' ('selector' — `select` is a reserved VB keyword.)</param>
    ''' <param name="skip">Rows to leave out — pass <c>Function(r) r.IsPlaceholder</c> to hide the
    ''' grid's "+ Add row…" row.</param>
    Public Sub New(rows As ObservableCollection(Of TRow), selector As Func(Of TRow, TValue), skip As Func(Of TRow, Boolean))
        If rows Is Nothing Then Throw New ArgumentNullException(NameOf(rows))
        If selector Is Nothing Then Throw New ArgumentNullException(NameOf(selector))
        _rows = rows
        _select = selector
        _skip = skip
        Mirror()
        AddHandler _rows.CollectionChanged, AddressOf OnRowsChanged
    End Sub

    Private Function Skipped(row As TRow) As Boolean
        If row Is Nothing Then Return True
        If _skip Is Nothing Then Return False
        Return _skip(row)
    End Function

    ''' <summary>Rebuilds the whole list from the row collection (initial load, and after a
    ''' Reset/Replace/Move, which are rare).</summary>
    Private Sub Mirror()
        For Each r In _mirror
            Unwatch(r)
        Next
        _mirror.Clear()
        MyBase.ClearItems()
        For Each r In _rows
            If Not Skipped(r) Then
                _mirror.Add(r)
                MyBase.InsertItem(_mirror.Count - 1, _select(r))
                Watch(r)
            End If
        Next
    End Sub

    ''' <summary>Keeps the list in step with the grid: new rows are inserted at their position,
    ''' deleted rows removed (so the control's selection is preserved for the others).</summary>
    Private Sub OnRowsChanged(sender As Object, e As NotifyCollectionChangedEventArgs)
        Select Case e.Action
            Case NotifyCollectionChangedAction.Add
                Dim row As TRow = CType(e.NewItems(0), TRow)
                If Skipped(row) Then Return
                Dim at As Integer = If(e.NewStartingIndex >= 0, e.NewStartingIndex, _rows.Count)
                Dim index As Integer = MirrorIndex(at)
                _mirror.Insert(index, row)
                MyBase.InsertItem(index, _select(row))
                Watch(row)
            Case NotifyCollectionChangedAction.Remove
                For Each item As Object In e.OldItems
                    Dim row As TRow = CType(item, TRow)
                    Dim index As Integer = _mirror.IndexOf(row)
                    If index >= 0 Then
                        Unwatch(row)
                        _mirror.RemoveAt(index)
                        MyBase.RemoveItem(index)
                    End If
                Next
            Case Else
                ' Replace / Move / Reset (a whole-collection swap) — rebuild; keeps the code tiny.
                Mirror()
        End Select
    End Sub

    ''' <summary>The list index of the row at <paramref name="rowIndex"/> in the row collection.</summary>
    Private Function MirrorIndex(rowIndex As Integer) As Integer
        Dim count As Integer = 0
        Dim limit As Integer = Math.Min(rowIndex, _rows.Count)
        For i As Integer = 0 To limit - 1
            If Not Skipped(_rows(i)) Then count += 1
        Next
        Return count
    End Function

    Private Sub Watch(row As TRow)
        Dim source As INotifyPropertyChanged = TryCast(row, INotifyPropertyChanged)
        If source IsNot Nothing Then AddHandler source.PropertyChanged, AddressOf OnRowChanged
    End Sub

    Private Sub Unwatch(row As TRow)
        Dim source As INotifyPropertyChanged = TryCast(row, INotifyPropertyChanged)
        If source IsNot Nothing Then RemoveHandler source.PropertyChanged, AddressOf OnRowChanged
    End Sub

    ''' <summary>A cell of a mirrored row changed: rewrite just that entry in place, so the control
    ''' keeps its selected item.</summary>
    Private Sub OnRowChanged(sender As Object, e As PropertyChangedEventArgs)
        Dim row As TRow = CType(sender, TRow)
        Dim index As Integer = _mirror.IndexOf(row)
        If index < 0 Then Return
        Dim value As TValue = _select(row)
        If Not EqualityComparer(Of TValue).Default.Equals(Me(index), value) Then
            MyBase.SetItem(index, value)
        End If
    End Sub
End Class
