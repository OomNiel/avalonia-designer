// TreeBuilder.cs — BUNDLED RESOURCE (the VB twin is resources/TreeBuilder.vb). Copied into every
// generated project, next to AnchorHelper.cs / ExifImageLoader.cs / ColumnFollower.cs.
//
// Builds the node tree a TreeView shows, out of a FLAT table — which is what a SQLite database or a
// DataSet table always is.
//
// Why it exists: a TreeView cannot bind to rows. It binds to a hierarchy — ItemsSource for the
// roots, plus an ItemTemplate whose own ItemsSource follows each node's Children. Nothing in a table
// says which row sits inside which, so something has to build that shape. This is that something, and
// the designer's preview builds the same tree from the same rows, so the canvas shows what the app
// will show.
//
// Two shapes, because real tables come in two kinds:
//   * a self-referencing table — an id column and a parent column:
//       TreeView1.ItemsSource = TreeBuilder.Build(rows, r => r.Id, r => r.ParentId, r => r.Name);
//   * a depth or path column — a level number (0, 1, 2 …) or a dotted code ("1.2.3"):
//       TreeView1.ItemsSource = TreeBuilder.BuildByHierarchy(rows, r => r.Path, r => r.Name);
//
// Deliberately forgiving, because a database is not a well-formed tree:
//   * a row whose parent is missing becomes a root — an orphan is better shown than dropped;
//   * a cycle (A → B → A) is broken where it closes, so the result is always a tree;
//   * the order of the rows is the order of the nodes;
//   * a row with an empty name is shown as "?" rather than as a blank strip that looks broken.
//
// The XAML side (the designer writes this too, when you bind a TreeView to a table):
//   <TreeView x:Name="TreeView1">
//     <TreeView.ItemTemplate>
//       <TreeDataTemplate ItemsSource="{Binding Children}">
//         <TextBlock Text="{Binding Header}"/>
//       </TreeDataTemplate>
//     </TreeView.ItemTemplate>
//   </TreeView>
//
// NOTE: a TreeView may not have BOTH inline nodes and an ItemsSource — Avalonia throws
// "Items collection must be empty before using ItemsSource." The designer clears the inline nodes when
// you bind a table (asking first), the same rule as the ComboBox/ListBox items editors.

namespace AvaloniaChrome
{
    using System;
    using System.Collections.Generic;
    using System.Collections.ObjectModel;
    using System.Globalization;

    /// <summary>One node of a tree a TreeView can bind to: the text it shows and its children.</summary>
    public class TreeNode
    {
        public TreeNode(string header)
        {
            Header = header ?? string.Empty;
        }

        /// <summary>The text this node shows (<c>Header</c> is what a TreeViewItem displays).</summary>
        public string Header { get; set; }

        /// <summary>Nodes inside this one. Bind a TreeDataTemplate's ItemsSource to this property.</summary>
        public ObservableCollection<TreeNode> Children { get; } = new ObservableCollection<TreeNode>();

        public override string ToString()
        {
            return Header;
        }
    }

    /// <summary>Turns flat rows into the node tree a TreeView binds to.</summary>
    public static class TreeBuilder
    {
        /// <summary>Builds a tree from a self-referencing table: an id column and a parent column.</summary>
        public static ObservableCollection<TreeNode> Build<TRow>(
            IEnumerable<TRow> rows,
            Func<TRow, object> id,
            Func<TRow, object> parent,
            Func<TRow, string> name)
        {
            var list = new List<TRow>();
            if (rows != null)
            {
                foreach (var row in rows) list.Add(row);
            }

            var nodes = new List<TreeNode>(list.Count);
            var keys = new List<string>(list.Count);
            var parents = new List<string>(list.Count);
            var index = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < list.Count; i++)
            {
                nodes.Add(new TreeNode(Text(name(list[i]))));
                var key = Key(id(list[i]));
                keys.Add(key);
                parents.Add(Key(parent(list[i])));
                if (key.Length > 0 && !index.ContainsKey(key)) index[key] = i;
            }

            var roots = new ObservableCollection<TreeNode>();
            for (var i = 0; i < nodes.Count; i++)
            {
                var parentKey = parents[i];
                var parentAt = -1;
                if (parentKey.Length > 0)
                {
                    int at;
                    if (index.TryGetValue(parentKey, out at) && at != i) parentAt = at;
                }

                // A cycle is broken where it closes (A → B → A): the row that would close it becomes a root,
                // so the result is always a tree and never an infinite one.
                if (parentAt >= 0 && !ReachesUpwards(index, keys, parents, parentAt, i))
                {
                    nodes[parentAt].Children.Add(nodes[i]);
                }
                else
                {
                    roots.Add(nodes[i]);
                }
            }

            return roots;
        }

        /// <summary>
        /// Builds a tree from a depth or path column: a level number (0, 1, 2 …) or a dotted code
        /// ("1.2.3"). Which of the two it is, is detected from the values, so the caller only has to point
        /// at the column — a decision a novice should not have to make.
        /// </summary>
        public static ObservableCollection<TreeNode> BuildByHierarchy<TRow>(
            IEnumerable<TRow> rows,
            Func<TRow, object> levelOrPath,
            Func<TRow, string> name)
        {
            var list = new List<TRow>();
            if (rows != null)
            {
                foreach (var row in rows) list.Add(row);
            }

            var values = new List<string>(list.Count);
            var numeric = true;
            foreach (var row in list)
            {
                var value = Key(levelOrPath(row));
                values.Add(value);
                if (value.Length > 0)
                {
                    int ignored;
                    if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out ignored))
                    {
                        numeric = false;
                    }
                }
            }

            var roots = new ObservableCollection<TreeNode>();
            if (numeric) BuildByLevel(list, values, name, roots);
            else BuildByPath(list, values, name, roots);
            return roots;
        }

        /// <summary>A level number per row: 0 is a root, level N hangs under the last node seen at N-1.</summary>
        private static void BuildByLevel<TRow>(
            List<TRow> list,
            List<string> values,
            Func<TRow, string> name,
            ObservableCollection<TreeNode> roots)
        {
            var stack = new List<TreeNode>();
            for (var i = 0; i < list.Count; i++)
            {
                var node = new TreeNode(Text(name(list[i])));
                int level;
                if (!int.TryParse(values[i], NumberStyles.Integer, CultureInfo.InvariantCulture, out level)
                    || level < 0)
                {
                    level = 0;
                }

                while (stack.Count > level) stack.RemoveAt(stack.Count - 1);
                if (level == 0 || stack.Count < level)
                {
                    // A root, or a level that jumped (0 → 3): shown at the top rather than guessed at.
                    roots.Add(node);
                    stack.Clear();
                    stack.Add(node);
                    continue;
                }

                stack[stack.Count - 1].Children.Add(node);
                stack.Add(node);
            }
        }

        /// <summary>A dotted path per row: "1.2.3" hangs under "1.2", which hangs under "1".</summary>
        private static void BuildByPath<TRow>(
            List<TRow> list,
            List<string> values,
            Func<TRow, string> name,
            ObservableCollection<TreeNode> roots)
        {
            var byPath = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var ordered = new List<string>(list.Count);
            var nodes = new List<TreeNode>(list.Count);
            for (var i = 0; i < list.Count; i++)
            {
                var node = new TreeNode(Text(name(list[i])));
                var path = values[i].Replace('\\', '.').Trim('.');
                nodes.Add(node);
                ordered.Add(path);
                if (path.Length > 0 && !byPath.ContainsKey(path)) byPath[path] = i;
            }

            for (var i = 0; i < nodes.Count; i++)
            {
                var path = ordered[i];
                // The longest prefix that is actually in the table is the parent; a missing intermediate
                // level is not an error, and a row with no prefix at all is a root. Indices rather than
                // nodes, so this file compiles without a single nullable warning in any project — it is
                // copied into other people's code, and a bundled file must not add noise to their build.
                var parentAt = -1;
                var cut = path.LastIndexOf('.');
                while (cut > 0)
                {
                    var prefix = path.Substring(0, cut);
                    int at;
                    if (byPath.TryGetValue(prefix, out at) && at != i)
                    {
                        parentAt = at;
                        break;
                    }

                    cut = prefix.LastIndexOf('.');
                }

                if (parentAt >= 0) nodes[parentAt].Children.Add(nodes[i]);
                else roots.Add(nodes[i]);
            }
        }

        /// <summary>The comparable form of a key/value column: trimmed text, empty when null.</summary>
        private static string Key(object value)
        {
            if (value == null) return string.Empty;
            var text = Convert.ToString(value, CultureInfo.InvariantCulture);
            return text == null ? string.Empty : text.Trim();
        }

        /// <summary>The node's display text. An empty name becomes "?" — a blank strip looks broken.</summary>
        private static string Text(string name)
        {
            var text = (name ?? string.Empty).Trim();
            return text.Length > 0 ? text : "?";
        }

        /// <summary>True when `start` already sits inside `target` — i.e. attaching target under it would loop.</summary>
        private static bool ReachesUpwards(
            Dictionary<string, int> index,
            List<string> keys,
            List<string> parents,
            int start,
            int target)
        {
            var at = start;
            for (var guard = 0; at >= 0 && guard <= keys.Count; guard++)
            {
                if (at == target) return true;
                var key = keys[at];
                var parentKey = parents[at];
                int up;
                at = key.Length > 0 && parentKey.Length > 0 && index.TryGetValue(parentKey, out up) ? up : -1;
            }

            return false;
        }
    }
}
