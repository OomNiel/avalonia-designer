// BUNDLED-COPY: 0.12.10
// ============================================================================
//  GrumpyPanel.cs — Reusable Avalonia docking region panel ("GrumpyPanel").
//
//  A Border-based panel that acts as a nested "dock region" (like the form's own
//  root DockPanel + Body idiom, but as a reusable control you can drop anywhere):
//
//    - Drop the GrumpyPanel onto any canvas / panel. It has a Dock property of
//      its own (DockPanel.Dock), so it can also pin to a DockPanel edge.
//    - Its single Child is a DockPanel whose LAST child is the named free body
//      Canvas ("{name}Body"). Controls you drop inside the panel land freely in
//      that body canvas (exact Canvas.Left/Top placement, like the form's body).
//    - Dock-able controls (Menu / Status Bar / grids / images / …) can instead be
//      DOCKED to the panel's edges: they are placed into the inner DockPanel
//      (before the body) with DockPanel.Dock set, and the free body shrinks to
//      fill the remainder — real docking, no auto-placement of undocked children.
//
//  The control itself adds the Border chrome: Background / BorderBrush /
//  BorderThickness / CornerRadius (its "Theme" System/Custom frame is managed by
//  the designer — System writes no chrome attrs, Custom writes the four above).
//
//  DROP-IN USAGE
//  -------------
//  1. Copy this file into your project (or link it from a shared folder).
//  2. Use it in XAML with  xmlns:chrome="using:AvaloniaChrome":
//       <chrome:GrumpyPanel x:Name="GrumpyPanel1" Width="360" Height="220"
//                           Background="#F7F7F7" BorderBrush="#808080"
//                           BorderThickness="1" CornerRadius="4">
//         <DockPanel LastChildFill="True">
//           <Menu DockPanel.Dock="Top" Height="24">…</Menu>   <!-- docked band -->
//           <Canvas x:Name="GrumpyPanel1Body"/>              <!-- free body -->
//         </DockPanel>
//       </chrome:GrumpyPanel>
//  3. Done — no App.axaml changes required.
//
//  Version-agnostic across Avalonia 11.x/12.x (uses only the stable Border API).
// ============================================================================

using Avalonia;
using Avalonia.Controls;

namespace AvaloniaChrome;

/// <summary>
/// A docking-region panel: a <see cref="Border"/> frame that hosts a nested
/// DockPanel + free body (see the file header). The class exists so forms can
/// carry a real, distinct <c>chrome:GrumpyPanel</c> element; its layout is the
/// stock DockPanel/Canvas composition inside, so it previews and runs identically.
/// </summary>
public class GrumpyPanel : Border
{
    /// <summary>Marker used by the designer's bundled-component refresh (keeps old copies current).</summary>
    public const string BundledMarker = "GrumpyPanel";

    static GrumpyPanel()
    {
        // No theme override — the panel follows the app's Fluent theme unless the
        // form author sets Background/BorderBrush/BorderThickness/CornerRadius.
    }

    /// <summary>Creates a GrumpyPanel with no chrome (System theme) and no body yet.</summary>
    public GrumpyPanel()
    {
    }
}
