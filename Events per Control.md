# Events per Control — Avalonia 12.1.1

Every event that each control **actually exposes** in Avalonia 12.1.1 — the version the generated
projects and the designer's preview host both target — with the `EventArgs` type the handler must
take and the class that declares the event, so a hand-written handler is copy-paste accurate.

**How to read it**

- `★` — the event is in the **event picker's list** for that control (the curated set in
  `src/controlEvents.ts`). The **bold** entry is that control's *default* event: the picker
  preselects it, and it is wired silently when `avaloniaDesigner.askEventOnPlace` is off.
- `EventArgs` — the second parameter of the handler. VB.NET is strict about it (a mismatch fails
  the build with `AVLN:0004`); C# also accepts a base type, but the designer writes the exact one.
- *Declared by* — the class defining the event. Anything inherited from the common base classes
  (§1) is listed there once instead of repeated for all 100+ controls.
- **(asks on placement)** — dropping that control pops the event picker. All other controls are
  placed silently, but right-click → **Add event…** offers their events anyway.
- The three bundled helpers (`chrome:PathPicker`, `chrome:GrumpyPanel`, `chrome:ChromeWindow`) are
  our own `AvaloniaChrome` types: they expose the events of their base class — `UserControl`,
  `Border` and `Window` respectively — and nothing of their own. The two bundled charts
  (`charts:GrumpyLinePlot`, `charts:GrumpyXYPlot`, namespace `AvaloniaCharts`) likewise expose only
  what their base class `Control` provides — no events of their own; what looks like interaction
  (the legend's tick boxes, the draggable cursors, the in-chart "…" picker) is handled inside the
  control's own input methods, so there is no handler for the designer to wire.

## 0. Index

| Control | Default event | Picker list | Events total |
|---|---|---|---|
| [Window](#window) | — | 19 | 57 |
| [WindowBase](#windowbase) | — | 8 | 56 |
| [TopLevel](#toplevel) | — | — | 52 |
| [UserControl](#usercontrol) | — | 16 | 48 |
| [Button](#button) | `Click` | 16 | 49 |
| [CheckBox](#checkbox) | `IsCheckedChanged` | 12 | 50 |
| [RadioButton](#radiobutton) | `IsCheckedChanged` | 12 | 50 |
| [ToggleButton](#togglebutton) | — | 12 | 50 |
| [ToggleSwitch](#toggleswitch) | — | 12 | 50 |
| [RepeatButton](#repeatbutton) | — | 11 | 49 |
| [DropDownButton](#dropdownbutton) | — | 11 | 49 |
| [SplitButton](#splitbutton) | — | 11 | 49 |
| [ToggleSplitButton](#togglesplitbutton) | — | 10 | 50 |
| [ComboBox](#combobox) | `SelectionChanged` | 14 | 55 |
| [ComboBoxItem](#comboboxitem) | — | 11 | 48 |
| [DatePicker](#datepicker) | — | 8 | 49 |
| [CalendarDatePicker](#calendardatepicker) | — | 11 | 52 |
| [Calendar](#calendar) | — | — | 51 |
| [HyperlinkButton](#hyperlinkbutton) | `Click` | 11 | 49 |
| [Menu](#menu) | — | 5 | 55 |
| [MenuItem](#menuitem) | — | 6 | 57 |
| [MenuBase](#menubase) | — | — | 55 |
| [NativeMenuBar](#nativemenubar) | — | — | 48 |
| [CommandBar](#commandbar) | — | 7 | 52 |
| [CommandBarButton](#commandbarbutton) | `Click` | 11 | 49 |
| [CommandBarToggleButton](#commandbartogglebutton) | `IsCheckedChanged` | 10 | 50 |
| [CommandBarSeparator](#commandbarseparator) | — | — | 48 |
| [TextBox](#textbox) | `TextChanged` | 17 | 53 |
| [MaskedTextBox](#maskedtextbox) | — | 14 | 53 |
| [NumericUpDown](#numericupdown) | — | 9 | 50 |
| [AutoCompleteBox](#autocompletebox) | — | 13 | 56 |
| [TimePicker](#timepicker) | — | 8 | 49 |
| [SelectableTextBlock](#selectabletextblock) | — | 6 | 48 |
| [TextBlock](#textblock) | — | 16 | 47 |
| [Label](#label) | — | 16 | 48 |
| [AccessText](#accesstext) | — | — | 47 |
| [Image](#image) | — | 16 | 47 |
| [PathIcon](#pathicon) | — | 12 | 48 |
| [IconElement](#iconelement) | — | — | 48 |
| [ItemsControl](#itemscontrol) | — | 13 | 52 |
| [ListBox](#listbox) | `SelectionChanged` | 14 | 53 |
| [ListBoxItem](#listboxitem) | — | 13 | 48 |
| [TabControl](#tabcontrol) | `SelectionChanged` | 12 | 53 |
| [TabItem](#tabitem) | — | 13 | 48 |
| [TabStrip](#tabstrip) | — | — | 53 |
| [TabStripItem](#tabstripitem) | — | — | 48 |
| [TreeView](#treeview) | — | 12 | 53 |
| [TreeViewItem](#treeviewitem) | — | 13 | 54 |
| [Carousel](#carousel) | — | — | 53 |
| [SelectingItemsControl](#selectingitemscontrol) | — | — | 53 |
| [HeaderedItemsControl](#headereditemscontrol) | — | — | 52 |
| [HeaderedSelectingItemsControl](#headeredselectingitemscontrol) | — | — | 53 |
| [VirtualizingCarouselPanel](#virtualizingcarouselpanel) | — | — | 47 |
| [VirtualizingStackPanel](#virtualizingstackpanel) | — | — | 49 |
| [VirtualizingPanel](#virtualizingpanel) | — | — | 47 |
| [RefreshContainer](#refreshcontainer) | — | — | 49 |
| [RefreshVisualizer](#refreshvisualizer) | — | — | 49 |
| [Panel](#panel) | — | 16 | 47 |
| [Grid](#grid) | — | 16 | 47 |
| [StackPanel](#stackpanel) | — | 16 | 49 |
| [DockPanel](#dockpanel) | — | 16 | 47 |
| [WrapPanel](#wrappanel) | — | 16 | 47 |
| [UniformGrid](#uniformgrid) | — | 16 | 47 |
| [Canvas](#canvas) | — | 16 | 47 |
| [RelativePanel](#relativepanel) | — | 16 | 47 |
| [ReversibleStackPanel](#reversiblestackpanel) | — | — | 49 |
| [Border](#border) | — | 17 | 47 |
| [Decorator](#decorator) | — | — | 47 |
| [GroupBox](#groupbox) | — | 16 | 48 |
| [Expander](#expander) | — | 15 | 52 |
| [Viewbox](#viewbox) | — | 12 | 47 |
| [LayoutTransformControl](#layouttransformcontrol) | — | — | 47 |
| [ScrollViewer](#scrollviewer) | — | 15 | 49 |
| [ScrollBar](#scrollbar) | — | — | 50 |
| [ScrollContentPresenter](#scrollcontentpresenter) | — | — | 47 |
| [Thumb](#thumb) | — | — | 51 |
| [Track](#track) | — | — | 47 |
| [GridSplitter](#gridsplitter) | — | — | 51 |
| [SplitView](#splitview) | — | — | 52 |
| [TransitioningContentControl](#transitioningcontentcontrol) | — | — | 49 |
| [ThemeVariantScope](#themevariantscope) | — | — | 47 |
| [ExperimentalAcrylicBorder](#experimentalacrylicborder) | — | — | 47 |
| [AdornerLayer](#adornerlayer) | — | — | 47 |
| [NativeControlHost](#nativecontrolhost) | — | — | 47 |
| [Shape](#shape) | — | — | 47 |
| [Rectangle](#rectangle) | — | 13 | 47 |
| [Ellipse](#ellipse) | — | 13 | 47 |
| [Line](#line) | — | 11 | 47 |
| [Path](#path) | — | 13 | 47 |
| [Polygon](#polygon) | — | 13 | 47 |
| [Polyline](#polyline) | — | 13 | 47 |
| [Arc](#arc) | — | 13 | 47 |
| [Sector](#sector) | — | — | 47 |
| [DataGrid](#datagrid) | `SelectionChanged` | 24 | 72 |
| [DataGridCell](#datagridcell) | — | — | 48 |
| [DataGridRow](#datagridrow) | — | — | 48 |
| [DataGridColumnHeader](#datagridcolumnheader) | — | — | 49 |
| [DataGridBoundColumn](#datagridboundcolumn) | — | — | 3 |
| [DataGridTextColumn](#datagridtextcolumn) | — | — | 3 |
| [DataGridCheckBoxColumn](#datagridcheckboxcolumn) | — | — | 3 |
| [DataGridTemplateColumn](#datagridtemplatecolumn) | — | — | 3 |
| [DataValidationErrors](#datavalidationerrors) | — | — | 48 |
| [Slider](#slider) | — | 10 | 49 |
| [RangeBase](#rangebase) | — | — | 49 |
| [ProgressBar](#progressbar) | — | 3 | 49 |
| [TickBar](#tickbar) | — | — | 47 |
| [Separator](#separator) | — | 2 | 48 |
| [ContextMenu](#contextmenu) | — | 4 | 57 |
| [ToolTip](#tooltip) | — | — | 48 |
| [FlyoutPresenter](#flyoutpresenter) | — | — | 48 |
| [PopupRoot](#popuproot) | — | — | 56 |
| [ContentControl](#contentcontrol) | — | 16 | 48 |
| [HeaderedContentControl](#headeredcontentcontrol) | — | — | 48 |

## 1. Events every control inherits

Declared by the base classes (`AvaloniaObject` → `StyledElement` → `Visual` → `Layoutable` →
`Interactive` → `InputElement` → `Control`), so they exist on *every* control below.

| Event | EventArgs | Declared by |
|---|---|---|
| `ActualThemeVariantChanged` | `System.EventArgs` | StyledElement |
| `AttachedToLogicalTree` | `Avalonia.LogicalTree.LogicalTreeAttachmentEventArgs` | StyledElement |
| `AttachedToVisualTree` | `Avalonia.VisualTreeAttachmentEventArgs` | Visual |
| `ContextCanceled` | `Avalonia.Interactivity.RoutedEventArgs` | InputElement |
| `ContextRequested` | `Avalonia.Input.ContextRequestedEventArgs` | InputElement |
| `DataContextChanged` | `System.EventArgs` | StyledElement |
| `DetachedFromLogicalTree` | `Avalonia.LogicalTree.LogicalTreeAttachmentEventArgs` | StyledElement |
| `DetachedFromVisualTree` | `Avalonia.VisualTreeAttachmentEventArgs` | Visual |
| `DoubleTapped` | `Avalonia.Input.TappedEventArgs` | InputElement |
| `EffectiveViewportChanged` | `Avalonia.Layout.EffectiveViewportChangedEventArgs` | Layoutable |
| `GettingFocus` | `Avalonia.Input.FocusChangingEventArgs` | InputElement |
| `GotFocus` | `Avalonia.Input.FocusChangedEventArgs` | InputElement |
| `Holding` | `Avalonia.Input.HoldingRoutedEventArgs` | InputElement |
| `Initialized` | `System.EventArgs` | StyledElement |
| `KeyDown` | `Avalonia.Input.KeyEventArgs` | InputElement |
| `KeyUp` | `Avalonia.Input.KeyEventArgs` | InputElement |
| `LayoutUpdated` | `System.EventArgs` | Layoutable |
| `Loaded` | `Avalonia.Interactivity.RoutedEventArgs` | Control |
| `LosingFocus` | `Avalonia.Input.FocusChangingEventArgs` | InputElement |
| `LostFocus` | `Avalonia.Input.FocusChangedEventArgs` | InputElement |
| `Pinch` | `Avalonia.Input.PinchEventArgs` | InputElement |
| `PinchEnded` | `Avalonia.Input.PinchEndedEventArgs` | InputElement |
| `PointerCaptureLost` | `Avalonia.Input.PointerCaptureLostEventArgs` | InputElement |
| `PointerEntered` | `Avalonia.Input.PointerEventArgs` | InputElement |
| `PointerExited` | `Avalonia.Input.PointerEventArgs` | InputElement |
| `PointerMoved` | `Avalonia.Input.PointerEventArgs` | InputElement |
| `PointerPressed` | `Avalonia.Input.PointerPressedEventArgs` | InputElement |
| `PointerReleased` | `Avalonia.Input.PointerReleasedEventArgs` | InputElement |
| `PointerTouchPadGestureMagnify` | `Avalonia.Input.PointerDeltaEventArgs` | InputElement |
| `PointerTouchPadGestureRotate` | `Avalonia.Input.PointerDeltaEventArgs` | InputElement |
| `PointerTouchPadGestureSwipe` | `Avalonia.Input.PointerDeltaEventArgs` | InputElement |
| `PointerWheelChanged` | `Avalonia.Input.PointerWheelEventArgs` | InputElement |
| `PropertyChanged` | `Avalonia.AvaloniaPropertyChangedEventArgs` | AvaloniaObject |
| `PullGesture` | `Avalonia.Input.PullGestureEventArgs` | InputElement |
| `PullGestureEnded` | `Avalonia.Input.PullGestureEndedEventArgs` | InputElement |
| `ResourcesChanged` | `Avalonia.Controls.ResourcesChangedEventArgs` | StyledElement |
| `RightTapped` | `Avalonia.Input.TappedEventArgs` | InputElement |
| `ScrollGesture` | `Avalonia.Input.ScrollGestureEventArgs` | InputElement |
| `ScrollGestureEnded` | `Avalonia.Input.ScrollGestureEndedEventArgs` | InputElement |
| `ScrollGestureInertiaStarting` | `Avalonia.Input.ScrollGestureInertiaStartingEventArgs` | InputElement |
| `SizeChanged` | `Avalonia.Controls.SizeChangedEventArgs` | Control |
| `SwipeGesture` | `Avalonia.Input.SwipeGestureEventArgs` | InputElement |
| `SwipeGestureEnded` | `Avalonia.Input.SwipeGestureEndedEventArgs` | InputElement |
| `Tapped` | `Avalonia.Input.TappedEventArgs` | InputElement |
| `TextInput` | `Avalonia.Input.TextInputEventArgs` | InputElement |
| `TextInputMethodClientRequested` | `Avalonia.Input.TextInput.TextInputMethodClientRequestedEventArgs` | InputElement |
| `Unloaded` | `Avalonia.Interactivity.RoutedEventArgs` | Control |

## 2. Window roots

### Window

`Avalonia.Controls.Window` — 57 events in total, 10 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Activated` | `System.EventArgs` | WindowBase |  |
| `BackRequested` | `Avalonia.Interactivity.RoutedEventArgs` | TopLevel |  |
| ★ `Closed` | `System.EventArgs` | TopLevel |  |
| ★ `Closing` | `Avalonia.Controls.WindowClosingEventArgs` | Window |  |
| ★ `Deactivated` | `System.EventArgs` | WindowBase |  |
| ★ `Opened` | `System.EventArgs` | TopLevel |  |
| ★ `PositionChanged` | `Avalonia.Controls.PixelPointEventArgs` | WindowBase |  |
| ★ `Resized` | `Avalonia.Controls.WindowResizedEventArgs` | WindowBase |  |
| `ScalingChanged` | `System.EventArgs` | TopLevel |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### WindowBase

`Avalonia.Controls.WindowBase` — 56 events in total, 9 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Activated` | `System.EventArgs` | WindowBase |  |
| `BackRequested` | `Avalonia.Interactivity.RoutedEventArgs` | TopLevel |  |
| ★ `Closed` | `System.EventArgs` | TopLevel |  |
| ★ `Deactivated` | `System.EventArgs` | WindowBase |  |
| ★ `Opened` | `System.EventArgs` | TopLevel |  |
| ★ `PositionChanged` | `Avalonia.Controls.PixelPointEventArgs` | WindowBase |  |
| ★ `Resized` | `Avalonia.Controls.WindowResizedEventArgs` | WindowBase |  |
| `ScalingChanged` | `System.EventArgs` | TopLevel |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### TopLevel

`Avalonia.Controls.TopLevel` — 52 events in total, 5 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `BackRequested` | `Avalonia.Interactivity.RoutedEventArgs` | TopLevel |  |
| `Closed` | `Avalonia.Interactivity.RoutedEventArgs` | TopLevel |  |
| `Opened` | `Avalonia.Interactivity.RoutedEventArgs` | TopLevel |  |
| `ScalingChanged` | `System.EventArgs` | TopLevel |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### UserControl

`Avalonia.Controls.UserControl` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

## 3. Buttons & command controls

### Button (asks on placement)

`Avalonia.Controls.Button` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ **Click** | `Avalonia.Interactivity.RoutedEventArgs` | Button | **default event** |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### CheckBox (asks on placement)

`Avalonia.Controls.CheckBox` — 50 events in total, 3 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Click` | `Avalonia.Interactivity.RoutedEventArgs` | Button |  |
| ★ **IsCheckedChanged** | `Avalonia.Interactivity.RoutedEventArgs` | ToggleButton | **default event** |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### RadioButton (asks on placement)

`Avalonia.Controls.RadioButton` — 50 events in total, 3 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Click` | `Avalonia.Interactivity.RoutedEventArgs` | Button |  |
| ★ **IsCheckedChanged** | `Avalonia.Interactivity.RoutedEventArgs` | ToggleButton | **default event** |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### ToggleButton (asks on placement)

`Avalonia.Controls.ToggleButton` — 50 events in total, 3 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Click` | `Avalonia.Interactivity.RoutedEventArgs` | Button |  |
| ★ `IsCheckedChanged` | `Avalonia.Interactivity.RoutedEventArgs` | ToggleButton |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### ToggleSwitch (asks on placement)

`Avalonia.Controls.ToggleSwitch` — 50 events in total, 3 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Click` | `Avalonia.Interactivity.RoutedEventArgs` | Button |  |
| ★ `IsCheckedChanged` | `Avalonia.Interactivity.RoutedEventArgs` | ToggleButton |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### RepeatButton (asks on placement)

`Avalonia.Controls.RepeatButton` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Click` | `Avalonia.Interactivity.RoutedEventArgs` | Button |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### DropDownButton (asks on placement)

`Avalonia.Controls.DropDownButton` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Click` | `Avalonia.Interactivity.RoutedEventArgs` | Button |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### SplitButton (asks on placement)

`Avalonia.Controls.SplitButton` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Click` | `Avalonia.Interactivity.RoutedEventArgs` | SplitButton |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### ToggleSplitButton (asks on placement)

`Avalonia.Controls.ToggleSplitButton` — 50 events in total, 3 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Click` | `Avalonia.Interactivity.RoutedEventArgs` | SplitButton |  |
| ★ `IsCheckedChanged` | `Avalonia.Interactivity.RoutedEventArgs` | ToggleSplitButton |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### ComboBox (asks on placement)

`Avalonia.Controls.ComboBox` — 55 events in total, 8 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `ContainerClearing` | `Avalonia.Controls.ContainerClearingEventArgs` | ItemsControl |  |
| `ContainerIndexChanged` | `Avalonia.Controls.ContainerIndexChangedEventArgs` | ItemsControl |  |
| `ContainerPrepared` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| ★ `DropDownClosed` | `System.EventArgs` | ComboBox |  |
| ★ `DropDownOpened` | `System.EventArgs` | ComboBox |  |
| `PreparingContainer` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| ★ **SelectionChanged** | `Avalonia.Controls.SelectionChangedEventArgs` | SelectingItemsControl | **default event** |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### ComboBoxItem

`Avalonia.Controls.ComboBoxItem` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### DatePicker (asks on placement)

`Avalonia.Controls.DatePicker` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `SelectedDateChanged` | `Avalonia.Controls.DatePickerSelectedValueChangedEventArgs` | DatePicker |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### CalendarDatePicker (asks on placement)

`Avalonia.Controls.CalendarDatePicker` — 52 events in total, 5 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `CalendarClosed` | `System.EventArgs` | CalendarDatePicker |  |
| ★ `CalendarOpened` | `System.EventArgs` | CalendarDatePicker |  |
| ★ `DateValidationError` | `Avalonia.Controls.CalendarDatePickerDateValidationErrorEventArgs` | CalendarDatePicker |  |
| ★ `SelectedDateChanged` | `Avalonia.Controls.SelectionChangedEventArgs` | CalendarDatePicker |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### Calendar

`Avalonia.Controls.Calendar` — 51 events in total, 4 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `DisplayDateChanged` | `Avalonia.Controls.CalendarDateChangedEventArgs` | Calendar |  |
| `DisplayModeChanged` | `Avalonia.Controls.CalendarModeChangedEventArgs` | Calendar |  |
| `SelectedDatesChanged` | `Avalonia.Controls.SelectionChangedEventArgs` | Calendar |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### HyperlinkButton (asks on placement)

`Avalonia.Controls.HyperlinkButton` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ **Click** | `Avalonia.Interactivity.RoutedEventArgs` | Button | **default event** |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### Menu (asks on placement)

`Avalonia.Controls.Menu` — 55 events in total, 8 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Closed` | `Avalonia.Interactivity.RoutedEventArgs` | MenuBase |  |
| `ContainerClearing` | `Avalonia.Controls.ContainerClearingEventArgs` | ItemsControl |  |
| `ContainerIndexChanged` | `Avalonia.Controls.ContainerIndexChangedEventArgs` | ItemsControl |  |
| `ContainerPrepared` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| ★ `Opened` | `Avalonia.Interactivity.RoutedEventArgs` | MenuBase |  |
| `PreparingContainer` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| ★ `SelectionChanged` | `Avalonia.Controls.SelectionChangedEventArgs` | SelectingItemsControl |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### MenuItem (asks on placement)

`Avalonia.Controls.MenuItem` — 57 events in total, 10 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Click` | `Avalonia.Interactivity.RoutedEventArgs` | MenuItem |  |
| `ContainerClearing` | `Avalonia.Controls.ContainerClearingEventArgs` | ItemsControl |  |
| `ContainerIndexChanged` | `Avalonia.Controls.ContainerIndexChangedEventArgs` | ItemsControl |  |
| `ContainerPrepared` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `PointerEnteredItem` | `Avalonia.Interactivity.RoutedEventArgs` | MenuItem |  |
| `PointerExitedItem` | `Avalonia.Interactivity.RoutedEventArgs` | MenuItem |  |
| `PreparingContainer` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `SelectionChanged` | `Avalonia.Controls.SelectionChangedEventArgs` | SelectingItemsControl |  |
| ★ `SubmenuOpened` | `Avalonia.Interactivity.RoutedEventArgs` | MenuItem |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### MenuBase

`Avalonia.Controls.MenuBase` — 55 events in total, 8 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `Closed` | `Avalonia.Interactivity.RoutedEventArgs` | MenuBase |  |
| `ContainerClearing` | `Avalonia.Controls.ContainerClearingEventArgs` | ItemsControl |  |
| `ContainerIndexChanged` | `Avalonia.Controls.ContainerIndexChangedEventArgs` | ItemsControl |  |
| `ContainerPrepared` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `Opened` | `Avalonia.Interactivity.RoutedEventArgs` | MenuBase |  |
| `PreparingContainer` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `SelectionChanged` | `Avalonia.Controls.SelectionChangedEventArgs` | SelectingItemsControl |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### NativeMenuBar

`Avalonia.Controls.NativeMenuBar` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### CommandBar

`Avalonia.Controls.CommandBar` — 52 events in total, 5 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Closed` | `Avalonia.Interactivity.RoutedEventArgs` | CommandBar |  |
| ★ `Closing` | `Avalonia.Controls.WindowClosingEventArgs` | CommandBar |  |
| ★ `Opened` | `Avalonia.Interactivity.RoutedEventArgs` | CommandBar |  |
| `Opening` | `Avalonia.Interactivity.RoutedEventArgs` | CommandBar |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### CommandBarButton (asks on placement)

`Avalonia.Controls.CommandBarButton` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ **Click** | `Avalonia.Interactivity.RoutedEventArgs` | Button | **default event** |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### CommandBarToggleButton (asks on placement)

`Avalonia.Controls.CommandBarToggleButton` — 50 events in total, 3 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Click` | `Avalonia.Interactivity.RoutedEventArgs` | Button |  |
| ★ **IsCheckedChanged** | `Avalonia.Interactivity.RoutedEventArgs` | ToggleButton | **default event** |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### CommandBarSeparator

`Avalonia.Controls.CommandBarSeparator` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

## 4. Input & text editors

### TextBox (asks on placement)

`Avalonia.Controls.TextBox` — 53 events in total, 6 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `CopyingToClipboard` | `Avalonia.Interactivity.RoutedEventArgs` | TextBox |  |
| ★ `CuttingToClipboard` | `Avalonia.Interactivity.RoutedEventArgs` | TextBox |  |
| ★ `PastingFromClipboard` | `Avalonia.Interactivity.RoutedEventArgs` | TextBox |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |
| ★ **TextChanged** | `Avalonia.Controls.TextChangedEventArgs` | TextBox | **default event** |
| ★ `TextChanging` | `Avalonia.Controls.TextChangingEventArgs` | TextBox |  |

### MaskedTextBox

`Avalonia.Controls.MaskedTextBox` — 53 events in total, 6 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `CopyingToClipboard` | `Avalonia.Interactivity.RoutedEventArgs` | TextBox |  |
| `CuttingToClipboard` | `Avalonia.Interactivity.RoutedEventArgs` | TextBox |  |
| `PastingFromClipboard` | `Avalonia.Interactivity.RoutedEventArgs` | TextBox |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |
| ★ `TextChanged` | `Avalonia.Controls.TextChangedEventArgs` | TextBox |  |
| ★ `TextChanging` | `Avalonia.Controls.TextChangingEventArgs` | TextBox |  |

### NumericUpDown (asks on placement)

`Avalonia.Controls.NumericUpDown` — 50 events in total, 3 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Spinned` | `Avalonia.Controls.SpinEventArgs` | NumericUpDown |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |
| ★ `ValueChanged` | `Avalonia.Controls.NumericUpDownValueChangedEventArgs` | NumericUpDown |  |

### AutoCompleteBox (asks on placement)

`Avalonia.Controls.AutoCompleteBox` — 56 events in total, 9 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `DropDownClosed` | `System.EventArgs` | AutoCompleteBox |  |
| `DropDownClosing` | `System.ComponentModel.CancelEventArgs` | AutoCompleteBox |  |
| ★ `DropDownOpened` | `System.EventArgs` | AutoCompleteBox |  |
| `DropDownOpening` | `System.ComponentModel.CancelEventArgs` | AutoCompleteBox |  |
| ★ `Populated` | `Avalonia.Controls.PopulatedEventArgs` | AutoCompleteBox |  |
| ★ `Populating` | `Avalonia.Controls.PopulatingEventArgs` | AutoCompleteBox |  |
| ★ `SelectionChanged` | `Avalonia.Controls.SelectionChangedEventArgs` | AutoCompleteBox |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |
| ★ `TextChanged` | `Avalonia.Controls.TextChangedEventArgs` | AutoCompleteBox |  |

### TimePicker (asks on placement)

`Avalonia.Controls.TimePicker` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `SelectedTimeChanged` | `Avalonia.Controls.TimePickerSelectedValueChangedEventArgs` | TimePicker |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### SelectableTextBlock

`Avalonia.Controls.SelectableTextBlock` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `CopyingToClipboard` | `Avalonia.Interactivity.RoutedEventArgs` | SelectableTextBlock |  |

### TextBlock

`Avalonia.Controls.TextBlock` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### Label

`Avalonia.Controls.Label` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### AccessText

`Avalonia.Controls.AccessText` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### Image

`Avalonia.Controls.Image` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### PathIcon

`Avalonia.Controls.PathIcon` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### IconElement

`Avalonia.Controls.IconElement` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

## 5. Items controls & lists

### ItemsControl

`Avalonia.Controls.ItemsControl` — 52 events in total, 5 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `ContainerClearing` | `Avalonia.Controls.ContainerClearingEventArgs` | ItemsControl |  |
| `ContainerIndexChanged` | `Avalonia.Controls.ContainerIndexChangedEventArgs` | ItemsControl |  |
| `ContainerPrepared` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `PreparingContainer` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### ListBox (asks on placement)

`Avalonia.Controls.ListBox` — 53 events in total, 6 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `ContainerClearing` | `Avalonia.Controls.ContainerClearingEventArgs` | ItemsControl |  |
| `ContainerIndexChanged` | `Avalonia.Controls.ContainerIndexChangedEventArgs` | ItemsControl |  |
| `ContainerPrepared` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `PreparingContainer` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| ★ **SelectionChanged** | `Avalonia.Controls.SelectionChangedEventArgs` | SelectingItemsControl | **default event** |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### ListBoxItem

`Avalonia.Controls.ListBoxItem` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### TabControl (asks on placement)

`Avalonia.Controls.TabControl` — 53 events in total, 6 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `ContainerClearing` | `Avalonia.Controls.ContainerClearingEventArgs` | ItemsControl |  |
| `ContainerIndexChanged` | `Avalonia.Controls.ContainerIndexChangedEventArgs` | ItemsControl |  |
| `ContainerPrepared` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `PreparingContainer` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| ★ **SelectionChanged** | `Avalonia.Controls.SelectionChangedEventArgs` | SelectingItemsControl | **default event** |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### TabItem

`Avalonia.Controls.TabItem` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### TabStrip

`Avalonia.Controls.TabStrip` — 53 events in total, 6 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `ContainerClearing` | `Avalonia.Controls.ContainerClearingEventArgs` | ItemsControl |  |
| `ContainerIndexChanged` | `Avalonia.Controls.ContainerIndexChangedEventArgs` | ItemsControl |  |
| `ContainerPrepared` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `PreparingContainer` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `SelectionChanged` | `Avalonia.Controls.SelectionChangedEventArgs` | SelectingItemsControl |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### TabStripItem

`Avalonia.Controls.TabStripItem` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### TreeView (asks on placement)

`Avalonia.Controls.TreeView` — 53 events in total, 6 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `ContainerClearing` | `Avalonia.Controls.ContainerClearingEventArgs` | ItemsControl |  |
| `ContainerIndexChanged` | `Avalonia.Controls.ContainerIndexChangedEventArgs` | ItemsControl |  |
| `ContainerPrepared` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `PreparingContainer` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| ★ `SelectionChanged` | `Avalonia.Controls.SelectionChangedEventArgs` | TreeView |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### TreeViewItem

`Avalonia.Controls.TreeViewItem` — 54 events in total, 7 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Collapsed` | `Avalonia.Interactivity.RoutedEventArgs` | TreeViewItem |  |
| `ContainerClearing` | `Avalonia.Controls.ContainerClearingEventArgs` | ItemsControl |  |
| `ContainerIndexChanged` | `Avalonia.Controls.ContainerIndexChangedEventArgs` | ItemsControl |  |
| `ContainerPrepared` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| ★ `Expanded` | `Avalonia.Interactivity.RoutedEventArgs` | TreeViewItem |  |
| `PreparingContainer` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### Carousel

`Avalonia.Controls.Carousel` — 53 events in total, 6 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `ContainerClearing` | `Avalonia.Controls.ContainerClearingEventArgs` | ItemsControl |  |
| `ContainerIndexChanged` | `Avalonia.Controls.ContainerIndexChangedEventArgs` | ItemsControl |  |
| `ContainerPrepared` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `PreparingContainer` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `SelectionChanged` | `Avalonia.Controls.SelectionChangedEventArgs` | SelectingItemsControl |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### SelectingItemsControl

`Avalonia.Controls.SelectingItemsControl` — 53 events in total, 6 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `ContainerClearing` | `Avalonia.Controls.ContainerClearingEventArgs` | ItemsControl |  |
| `ContainerIndexChanged` | `Avalonia.Controls.ContainerIndexChangedEventArgs` | ItemsControl |  |
| `ContainerPrepared` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `PreparingContainer` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `SelectionChanged` | `Avalonia.Controls.SelectionChangedEventArgs` | SelectingItemsControl |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### HeaderedItemsControl

`Avalonia.Controls.HeaderedItemsControl` — 52 events in total, 5 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `ContainerClearing` | `Avalonia.Controls.ContainerClearingEventArgs` | ItemsControl |  |
| `ContainerIndexChanged` | `Avalonia.Controls.ContainerIndexChangedEventArgs` | ItemsControl |  |
| `ContainerPrepared` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `PreparingContainer` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### HeaderedSelectingItemsControl

`Avalonia.Controls.HeaderedSelectingItemsControl` — 53 events in total, 6 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `ContainerClearing` | `Avalonia.Controls.ContainerClearingEventArgs` | ItemsControl |  |
| `ContainerIndexChanged` | `Avalonia.Controls.ContainerIndexChangedEventArgs` | ItemsControl |  |
| `ContainerPrepared` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `PreparingContainer` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `SelectionChanged` | `Avalonia.Controls.SelectionChangedEventArgs` | SelectingItemsControl |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### VirtualizingCarouselPanel

`Avalonia.Controls.VirtualizingCarouselPanel` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### VirtualizingStackPanel

`Avalonia.Controls.VirtualizingStackPanel` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `HorizontalSnapPointsChanged` | `Avalonia.Interactivity.RoutedEventArgs` | VirtualizingStackPanel |  |
| `VerticalSnapPointsChanged` | `Avalonia.Interactivity.RoutedEventArgs` | VirtualizingStackPanel |  |

### VirtualizingPanel

`Avalonia.Controls.VirtualizingPanel` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### RefreshContainer

`Avalonia.Controls.RefreshContainer` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `RefreshRequested` | `Avalonia.Controls.RefreshRequestedEventArgs` | RefreshContainer |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### RefreshVisualizer

`Avalonia.Controls.RefreshVisualizer` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `RefreshRequested` | `Avalonia.Controls.RefreshRequestedEventArgs` | RefreshVisualizer |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

## 6. Layout panels

### Panel

`Avalonia.Controls.Panel` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### Grid

`Avalonia.Controls.Grid` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### StackPanel

`Avalonia.Controls.StackPanel` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `HorizontalSnapPointsChanged` | `Avalonia.Interactivity.RoutedEventArgs` | StackPanel |  |
| `VerticalSnapPointsChanged` | `Avalonia.Interactivity.RoutedEventArgs` | StackPanel |  |

### DockPanel

`Avalonia.Controls.DockPanel` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### WrapPanel

`Avalonia.Controls.WrapPanel` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### UniformGrid

`Avalonia.Controls.UniformGrid` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### Canvas

`Avalonia.Controls.Canvas` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### RelativePanel

`Avalonia.Controls.RelativePanel` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### ReversibleStackPanel

`Avalonia.Controls.ReversibleStackPanel` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `HorizontalSnapPointsChanged` | `Avalonia.Interactivity.RoutedEventArgs` | StackPanel |  |
| `VerticalSnapPointsChanged` | `Avalonia.Interactivity.RoutedEventArgs` | StackPanel |  |

### Border

`Avalonia.Controls.Border` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### Decorator

`Avalonia.Controls.Decorator` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### GroupBox

`Avalonia.Controls.GroupBox` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### Expander

`Avalonia.Controls.Expander` — 52 events in total, 5 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Collapsed` | `Avalonia.Interactivity.RoutedEventArgs` | Expander |  |
| ★ `Collapsing` | `Avalonia.Interactivity.CancelRoutedEventArgs` | Expander |  |
| ★ `Expanded` | `Avalonia.Interactivity.RoutedEventArgs` | Expander |  |
| ★ `Expanding` | `Avalonia.Interactivity.CancelRoutedEventArgs` | Expander |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### Viewbox

`Avalonia.Controls.Viewbox` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### LayoutTransformControl

`Avalonia.Controls.LayoutTransformControl` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### ScrollViewer

`Avalonia.Controls.ScrollViewer` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `ScrollChanged` | `Avalonia.Controls.ScrollChangedEventArgs` | ScrollViewer |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### ScrollBar

`Avalonia.Controls.ScrollBar` — 50 events in total, 3 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `Scroll` | `Avalonia.Controls.Primitives.ScrollEventArgs` | ScrollBar |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |
| `ValueChanged` | `Avalonia.Controls.Primitives.RangeBaseValueChangedEventArgs` | RangeBase |  |

### ScrollContentPresenter

`Avalonia.Controls.ScrollContentPresenter` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### Thumb

`Avalonia.Controls.Thumb` — 51 events in total, 4 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `DragCompleted` | `Avalonia.Input.VectorEventArgs` | Thumb |  |
| `DragDelta` | `Avalonia.Input.VectorEventArgs` | Thumb |  |
| `DragStarted` | `Avalonia.Input.VectorEventArgs` | Thumb |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### Track

`Avalonia.Controls.Track` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### GridSplitter

`Avalonia.Controls.GridSplitter` — 51 events in total, 4 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `DragCompleted` | `Avalonia.Input.VectorEventArgs` | Thumb |  |
| `DragDelta` | `Avalonia.Input.VectorEventArgs` | Thumb |  |
| `DragStarted` | `Avalonia.Input.VectorEventArgs` | Thumb |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### SplitView

`Avalonia.Controls.SplitView` — 52 events in total, 5 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `PaneClosed` | `Avalonia.Interactivity.RoutedEventArgs` | SplitView |  |
| `PaneClosing` | `Avalonia.Interactivity.CancelRoutedEventArgs` | SplitView |  |
| `PaneOpened` | `Avalonia.Interactivity.RoutedEventArgs` | SplitView |  |
| `PaneOpening` | `Avalonia.Interactivity.CancelRoutedEventArgs` | SplitView |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### TransitioningContentControl

`Avalonia.Controls.TransitioningContentControl` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |
| `TransitionCompleted` | `Avalonia.Controls.TransitionCompletedEventArgs` | TransitioningContentControl |  |

### ThemeVariantScope

`Avalonia.Controls.ThemeVariantScope` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### ExperimentalAcrylicBorder

`Avalonia.Controls.ExperimentalAcrylicBorder` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### AdornerLayer

`Avalonia.Controls.AdornerLayer` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### NativeControlHost

`Avalonia.Controls.NativeControlHost` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

## 7. Shapes

### Shape

`Avalonia.Controls.Shape` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### Rectangle

`Avalonia.Controls.Rectangle` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### Ellipse

`Avalonia.Controls.Ellipse` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### Line

`Avalonia.Controls.Line` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### Path

`Avalonia.Controls.Path` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### Polygon

`Avalonia.Controls.Polygon` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### Polyline

`Avalonia.Controls.Polyline` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### Arc

`Avalonia.Controls.Arc` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### Sector

`Avalonia.Controls.Sector` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

## 8. Data & grid

### DataGrid (asks on placement)

`Avalonia.Controls.DataGrid` — 72 events in total, 25 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `AutoGeneratingColumn` | `Avalonia.Controls.DataGridAutoGeneratingColumnEventArgs` | DataGrid |  |
| ★ `BeginningEdit` | `Avalonia.Controls.DataGridBeginningEditEventArgs` | DataGrid |  |
| ★ `CellEditEnded` | `Avalonia.Controls.DataGridCellEditEndedEventArgs` | DataGrid |  |
| ★ `CellEditEnding` | `Avalonia.Controls.DataGridCellEditEndingEventArgs` | DataGrid |  |
| `CellPointerPressed` | `Avalonia.Controls.DataGridCellPointerPressedEventArgs` | DataGrid |  |
| ★ `ColumnDisplayIndexChanged` | `Avalonia.Controls.DataGridColumnEventArgs` | DataGrid |  |
| ★ `ColumnReordered` | `Avalonia.Controls.DataGridColumnEventArgs` | DataGrid |  |
| `ColumnReordering` | `Avalonia.Controls.DataGridColumnReorderingEventArgs` | DataGrid |  |
| `CopyingRowClipboardContent` | `Avalonia.Controls.DataGridRowClipboardEventArgs` | DataGrid |  |
| ★ `CurrentCellChanged` | `System.EventArgs` | DataGrid |  |
| `HorizontalScroll` | `Avalonia.Controls.Primitives.ScrollEventArgs` | DataGrid |  |
| ★ `LoadingRow` | `Avalonia.Controls.DataGridRowEventArgs` | DataGrid |  |
| `LoadingRowDetails` | `Avalonia.Controls.DataGridRowDetailsEventArgs` | DataGrid |  |
| `LoadingRowGroup` | `Avalonia.Controls.DataGridRowGroupHeaderEventArgs` | DataGrid |  |
| ★ `PreparingCellForEdit` | `Avalonia.Controls.DataGridPreparingCellForEditEventArgs` | DataGrid |  |
| `RowDetailsVisibilityChanged` | `Avalonia.Controls.DataGridRowDetailsEventArgs` | DataGrid |  |
| ★ `RowEditEnded` | `Avalonia.Controls.DataGridRowEditEndedEventArgs` | DataGrid |  |
| ★ `RowEditEnding` | `Avalonia.Controls.DataGridRowEditEndingEventArgs` | DataGrid |  |
| ★ **SelectionChanged** | `Avalonia.Controls.SelectionChangedEventArgs` | DataGrid | **default event** |
| ★ `Sorting` | `Avalonia.Controls.DataGridColumnEventArgs` | DataGrid |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |
| ★ `UnloadingRow` | `Avalonia.Controls.DataGridRowEventArgs` | DataGrid |  |
| `UnloadingRowDetails` | `Avalonia.Controls.DataGridRowDetailsEventArgs` | DataGrid |  |
| `UnloadingRowGroup` | `Avalonia.Controls.DataGridRowGroupHeaderEventArgs` | DataGrid |  |
| `VerticalScroll` | `Avalonia.Controls.Primitives.ScrollEventArgs` | DataGrid |  |

### DataGridCell

`Avalonia.Controls.DataGridCell` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### DataGridRow

`Avalonia.Controls.DataGridRow` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### DataGridColumnHeader

`Avalonia.Controls.DataGridColumnHeader` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `LeftClick` | `Avalonia.Input.KeyModifiers` | DataGridColumnHeader |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### DataGridBoundColumn

`Avalonia.Controls.DataGridBoundColumn` — 3 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `HeaderPointerPressed` | `Avalonia.Input.PointerPressedEventArgs` | DataGridColumn |  |
| `HeaderPointerReleased` | `Avalonia.Input.PointerReleasedEventArgs` | DataGridColumn |  |

### DataGridTextColumn

`Avalonia.Controls.DataGridTextColumn` — 3 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `HeaderPointerPressed` | `Avalonia.Input.PointerPressedEventArgs` | DataGridColumn |  |
| `HeaderPointerReleased` | `Avalonia.Input.PointerReleasedEventArgs` | DataGridColumn |  |

### DataGridCheckBoxColumn

`Avalonia.Controls.DataGridCheckBoxColumn` — 3 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `HeaderPointerPressed` | `Avalonia.Input.PointerPressedEventArgs` | DataGridColumn |  |
| `HeaderPointerReleased` | `Avalonia.Input.PointerReleasedEventArgs` | DataGridColumn |  |

### DataGridTemplateColumn

`Avalonia.Controls.DataGridTemplateColumn` — 3 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `HeaderPointerPressed` | `Avalonia.Input.PointerPressedEventArgs` | DataGridColumn |  |
| `HeaderPointerReleased` | `Avalonia.Input.PointerReleasedEventArgs` | DataGridColumn |  |

### DataValidationErrors

`Avalonia.Controls.DataValidationErrors` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

## 9. Bars, menus & misc

### Slider (asks on placement)

`Avalonia.Controls.Slider` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |
| ★ `ValueChanged` | `Avalonia.Controls.Primitives.RangeBaseValueChangedEventArgs` | RangeBase |  |

### RangeBase

`Avalonia.Controls.RangeBase` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |
| `ValueChanged` | `Avalonia.Controls.Primitives.RangeBaseValueChangedEventArgs` | RangeBase |  |

### ProgressBar (asks on placement)

`Avalonia.Controls.ProgressBar` — 49 events in total, 2 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |
| ★ `ValueChanged` | `Avalonia.Controls.Primitives.RangeBaseValueChangedEventArgs` | RangeBase |  |

### TickBar

`Avalonia.Controls.TickBar` — 47 events in total, 0 of them beyond the
common ones.

It exposes only the [common events](#1-events-every-control-inherits).

### Separator

`Avalonia.Controls.Separator` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### ContextMenu

`Avalonia.Controls.ContextMenu` — 57 events in total, 10 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| ★ `Closed` | `Avalonia.Interactivity.RoutedEventArgs` | MenuBase |  |
| `Closing` | `Avalonia.Controls.WindowClosingEventArgs` | ContextMenu |  |
| `ContainerClearing` | `Avalonia.Controls.ContainerClearingEventArgs` | ItemsControl |  |
| `ContainerIndexChanged` | `Avalonia.Controls.ContainerIndexChangedEventArgs` | ItemsControl |  |
| `ContainerPrepared` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| ★ `Opened` | `Avalonia.Interactivity.RoutedEventArgs` | MenuBase |  |
| `Opening` | `?` | ContextMenu |  |
| `PreparingContainer` | `Avalonia.Controls.ContainerPreparedEventArgs` | ItemsControl |  |
| `SelectionChanged` | `Avalonia.Controls.SelectionChangedEventArgs` | SelectingItemsControl |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### ToolTip

`Avalonia.Controls.ToolTip` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### FlyoutPresenter

`Avalonia.Controls.FlyoutPresenter` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### PopupRoot

`Avalonia.Controls.PopupRoot` — 56 events in total, 9 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `Activated` | `System.EventArgs` | WindowBase |  |
| `BackRequested` | `Avalonia.Interactivity.RoutedEventArgs` | TopLevel |  |
| `Closed` | `Avalonia.Interactivity.RoutedEventArgs` | TopLevel |  |
| `Deactivated` | `System.EventArgs` | WindowBase |  |
| `Opened` | `Avalonia.Interactivity.RoutedEventArgs` | TopLevel |  |
| `PositionChanged` | `Avalonia.Controls.PixelPointEventArgs` | WindowBase |  |
| `Resized` | `Avalonia.Controls.WindowResizedEventArgs` | WindowBase |  |
| `ScalingChanged` | `System.EventArgs` | TopLevel |  |
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

## 10. Base classes (never placed directly)

### ContentControl

`Avalonia.Controls.ContentControl` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

### HeaderedContentControl

`Avalonia.Controls.HeaderedContentControl` — 48 events in total, 1 of them beyond the
common ones.

| Event | EventArgs | Declared by | |
|---|---|---|---|
| `TemplateApplied` | `Avalonia.Controls.Primitives.TemplateAppliedEventArgs` | TemplatedControl |  |

---

## Regenerating after an Avalonia upgrade

This file is **generated**, not hand-written, and the data comes from reflecting over the real
Avalonia assemblies:

1. A throwaway console project referencing the same versions as `host/PreviewerHost.csproj`
   (`Avalonia` + `Avalonia.Controls.DataGrid`) prints one TAB-separated record per event —
   `Type · Event · DeclaringType · EventArgs · Instance|Static · DelegateType` — for every control
   type in `CONTROLS.md`: `dotnet run --project <tool> -- <types…> > events.tsv`
2. The markdown is then rendered from that dump **and the shipped catalog** (`out/controlEvents.js`),
   which is why the `★` marks and the `EventArgs` column always match what the designer actually
   writes into a handler.

Update `src/controlEvents.ts` from the same dump whenever you upgrade Avalonia: the curated lists,
`EVENT_ARGS`, `DEFAULT_EVENT` and the per-control overrides. `tests/t2-logic/controlEvents.test.js`
fails when a curated event has no `EventArgs` entry, and the VB matrix (`tests/t5-vbmatrix`)
compile-verifies every wired signature — so the catalog and the document cannot drift apart
silently.
