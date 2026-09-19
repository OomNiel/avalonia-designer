' TreeBuilder.vb — BUNDLED RESOURCE (the C# twin is resources/TreeBuilder.cs). Copied into every
' generated project, next to AnchorHelper.vb / ExifImageLoader.vb / ColumnFollower.vb.
'
' Builds the node tree a TreeView shows, out of a FLAT table — which is what a SQLite database or a
' DataSet table always is.
'
' Why it exists: a TreeView cannot bind to rows. It binds to a hierarchy — ItemsSource for the roots,
' plus an ItemTemplate whose own ItemsSource follows each node's Children. Nothing in a table says
' which row sits inside which, so something has to build that shape. This is that something, and the
' designer's preview builds the same tree from the same rows, so the canvas shows what the app will
' show.
'
' Two shapes, because real tables come in two kinds:
'   * a self-referencing table — an id column and a parent column:
'       TreeView1.ItemsSource = TreeBuilder.Build(rows, Function(r) r.Id, Function(r) r.ParentId, Function(r) r.Name)
'   * a depth or path column — a level number (0, 1, 2 …) or a dotted code ("1.2.3"):
'       TreeView1.ItemsSource = TreeBuilder.BuildByHierarchy(rows, Function(r) r.Path, Function(r) r.Name)
'
' Deliberately forgiving, because a database is not a well-formed tree:
'   * a row whose parent is missing becomes a root — an orphan is better shown than dropped;
'   * a cycle (A → B → A) is broken where it closes, so the result is always a tree;
'   * the order of the rows is the order of the nodes;
'   * a row with an empty name is shown as "?" rather than as a blank strip that looks broken.
'
' The XAML side (the designer writes this too, when you bind a TreeView to a table):
'   <TreeView x:Name="TreeView1">
'     <TreeView.ItemTemplate>
'       <TreeDataTemplate ItemsSource="{Binding Children}">
'         <TextBlock Text="{Binding Header}"/>
'       </TreeDataTemplate>
'     </TreeView.ItemTemplate>
'   </TreeView>
'
' NOTE: a TreeView may not have BOTH inline nodes and an ItemsSource — Avalonia throws
' "Items collection must be empty before using ItemsSource." The designer clears the inline nodes when
' you bind a table (asking first), the same rule as the ComboBox/ListBox items editors.
'
' Written with EXPLICIT conversions throughout, so it compiles unchanged in a project that turns
' Option Strict On.

Imports System
Imports System.Collections.Generic
Imports System.Collections.ObjectModel
Imports System.Globalization

Namespace AvaloniaChrome

    ''' <summary>One node of a tree a TreeView can bind to: the text it shows and its children.</summary>
    Public Class TreeNode

        Public Sub New(header As String)
            Me.Header = If(header, String.Empty)
        End Sub

        ''' <summary>The text this node shows (<c>Header</c> is what a TreeViewItem displays).</summary>
        Public Property Header As String

        ''' <summary>Nodes inside this one. Bind a TreeDataTemplate's ItemsSource to this property.</summary>
        Public ReadOnly Property Children As New ObservableCollection(Of TreeNode)()

        Public Overrides Function ToString() As String
            Return Header
        End Function

    End Class

    ''' <summary>Turns flat rows into the node tree a TreeView binds to.</summary>
    Public Class TreeBuilder

        ''' <summary>
        ''' A flat list of root nodes: a table with no hierarchy still shows its rows, one node each.
        ''' </summary>
        Public Shared Function BuildFlat(Of TRow)(
            rows As IEnumerable(Of TRow),
            name As Func(Of TRow, String)) As ObservableCollection(Of TreeNode)

            Dim nodes As New ObservableCollection(Of TreeNode)()
            If rows IsNot Nothing Then
                For Each row As TRow In rows
                    nodes.Add(New TreeNode(Text(name(row))))
                Next
            End If

            Return nodes
        End Function

        ''' <summary>Builds a tree from a self-referencing table: an id column and a parent column.</summary>
        Public Shared Function Build(Of TRow)(
            rows As IEnumerable(Of TRow),
            id As Func(Of TRow, Object),
            parent As Func(Of TRow, Object),
            name As Func(Of TRow, String)) As ObservableCollection(Of TreeNode)

            Dim list As New List(Of TRow)()
            If rows IsNot Nothing Then
                For Each row As TRow In rows
                    list.Add(row)
                Next
            End If

            Dim nodes As New List(Of TreeNode)(list.Count)
            Dim keys As New List(Of String)(list.Count)
            Dim parents As New List(Of String)(list.Count)
            Dim index As New Dictionary(Of String, Integer)(StringComparer.OrdinalIgnoreCase)

            For i As Integer = 0 To list.Count - 1
                nodes.Add(New TreeNode(Text(name(list(i)))))
                ' VB is case-insensitive, so a local called `key` would shadow the Key() helper above —
                ' which is exactly the kind of thing this file must not do in someone else's project.
                Dim nodeKey As String = Key(id(list(i)))
                keys.Add(nodeKey)
                parents.Add(Key(parent(list(i))))
                If nodeKey.Length > 0 AndAlso Not index.ContainsKey(nodeKey) Then index(nodeKey) = i
            Next

            Dim roots As New ObservableCollection(Of TreeNode)()
            For i As Integer = 0 To nodes.Count - 1
                Dim parentKey As String = parents(i)
                Dim parentAt As Integer = -1
                If parentKey.Length > 0 Then
                    Dim at As Integer = -1
                    If index.TryGetValue(parentKey, at) AndAlso at <> i Then parentAt = at
                End If

                ' A cycle is broken where it closes (A → B → A): the row that would close it becomes a
                ' root, so the result is always a tree and never an infinite one.
                If parentAt >= 0 AndAlso Not ReachesUpwards(index, keys, parents, parentAt, i) Then
                    nodes(parentAt).Children.Add(nodes(i))
                Else
                    roots.Add(nodes(i))
                End If
            Next

            Return roots

        End Function

        ''' <summary>
        ''' Builds a tree from a depth or path column: a level number (0, 1, 2 …) or a dotted code
        ''' ("1.2.3"). Which of the two it is, is detected from the values, so the caller only has to
        ''' point at the column — a decision a novice should not have to make.
        ''' </summary>
        Public Shared Function BuildByHierarchy(Of TRow)(
            rows As IEnumerable(Of TRow),
            levelOrPath As Func(Of TRow, Object),
            name As Func(Of TRow, String)) As ObservableCollection(Of TreeNode)

            Dim list As New List(Of TRow)()
            If rows IsNot Nothing Then
                For Each row As TRow In rows
                    list.Add(row)
                Next
            End If

            Dim values As New List(Of String)(list.Count)
            Dim numeric As Boolean = True
            For Each row As TRow In list
                Dim value As String = Key(levelOrPath(row))
                values.Add(value)
                If value.Length > 0 Then
                    Dim ignored As Integer = 0
                    If Not Integer.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, ignored) Then
                        numeric = False
                    End If
                End If
            Next

            Dim roots As New ObservableCollection(Of TreeNode)()
            If numeric Then
                BuildByLevel(list, values, name, roots)
            Else
                BuildByPath(list, values, name, roots)
            End If
            Return roots

        End Function

        ''' <summary>A level number per row: 0 is a root, level N hangs under the last node seen at N-1.</summary>
        Private Shared Sub BuildByLevel(Of TRow)(
            list As List(Of TRow),
            values As List(Of String),
            name As Func(Of TRow, String),
            roots As ObservableCollection(Of TreeNode))

            Dim stack As New List(Of TreeNode)()
            For i As Integer = 0 To list.Count - 1
                Dim node As New TreeNode(Text(name(list(i))))
                Dim level As Integer = 0
                If Not Integer.TryParse(values(i), NumberStyles.Integer, CultureInfo.InvariantCulture, level) Then level = 0
                If level < 0 Then level = 0

                While stack.Count > level
                    stack.RemoveAt(stack.Count - 1)
                End While

                If level = 0 OrElse stack.Count < level Then
                    ' A root, or a level that jumped (0 → 3): shown at the top rather than guessed at.
                    roots.Add(node)
                    stack.Clear()
                    stack.Add(node)
                    Continue For
                End If

                stack(stack.Count - 1).Children.Add(node)
                stack.Add(node)
            Next

        End Sub

        ''' <summary>A dotted path per row: "1.2.3" hangs under "1.2", which hangs under "1".</summary>
        Private Shared Sub BuildByPath(Of TRow)(
            list As List(Of TRow),
            values As List(Of String),
            name As Func(Of TRow, String),
            roots As ObservableCollection(Of TreeNode))

            Dim byPath As New Dictionary(Of String, Integer)(StringComparer.OrdinalIgnoreCase)
            Dim ordered As New List(Of String)(list.Count)
            Dim nodes As New List(Of TreeNode)(list.Count)

            For i As Integer = 0 To list.Count - 1
                Dim node As New TreeNode(Text(name(list(i))))
                Dim path As String = values(i).Replace("\"c, "."c).Trim("."c)
                nodes.Add(node)
                ordered.Add(path)
                If path.Length > 0 AndAlso Not byPath.ContainsKey(path) Then byPath(path) = i
            Next

            For i As Integer = 0 To nodes.Count - 1
                Dim path As String = ordered(i)
                ' The longest prefix that is actually in the table is the parent; a missing intermediate
                ' level is not an error, and a row with no prefix at all is a root. Indices rather than
                ' nodes, so this file compiles without a single warning anywhere it is copied.
                Dim parentAt As Integer = -1
                Dim cut As Integer = path.LastIndexOf("."c)
                While cut > 0
                    Dim prefix As String = path.Substring(0, cut)
                    Dim at As Integer = -1
                    If byPath.TryGetValue(prefix, at) AndAlso at <> i Then
                        parentAt = at
                        Exit While
                    End If
                    cut = prefix.LastIndexOf("."c)
                End While

                If parentAt >= 0 Then
                    nodes(parentAt).Children.Add(nodes(i))
                Else
                    roots.Add(nodes(i))
                End If
            Next

        End Sub

        ''' <summary>The comparable form of a key/value column: trimmed text, empty when Nothing.</summary>
        Private Shared Function Key(value As Object) As String
            If value Is Nothing Then Return String.Empty
            Dim raw As String = Convert.ToString(value, CultureInfo.InvariantCulture)
            If raw Is Nothing Then Return String.Empty
            Return raw.Trim()
        End Function

        ''' <summary>The node's display text. An empty name becomes "?" — a blank strip looks broken.</summary>
        Private Shared Function Text(name As String) As String
            If name Is Nothing Then Return "?"
            ' Not `text`: VB would read it as this function's own name.
            Dim label As String = name.Trim()
            Return If(label.Length > 0, label, "?")
        End Function

        ''' <summary>True when `start` already sits inside `target` — attaching target under it would loop.</summary>
        Private Shared Function ReachesUpwards(
            index As Dictionary(Of String, Integer),
            keys As List(Of String),
            parents As List(Of String),
            start As Integer,
            target As Integer) As Boolean

            Dim at As Integer = start
            Dim guard As Integer = 0
            While at >= 0 AndAlso guard <= keys.Count
                If at = target Then Return True
                Dim nodeKey As String = keys(at)
                Dim parentKey As String = parents(at)
                Dim up As Integer = -1
                at = If(nodeKey.Length > 0 AndAlso parentKey.Length > 0 AndAlso index.TryGetValue(parentKey, up), up, -1)
                guard += 1
            End While

            Return False

        End Function

    End Class

End Namespace
