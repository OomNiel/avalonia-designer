/* T2 — XamlModel: parse / add / move / resize (all 8 corners) / serialize (event strip vs keep) /
 * auto-names / items editing / single-content wrap / ChromeWindow conversion. */
'use strict';
const { XamlModel } = require('../../out/xamlModel.js');
const { CHROME_TITLEBAR_HEIGHT } = require('../../out/formTemplates.js');

const NS = 'xmlns="https://github.com/avaloniaui" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"';
const WINDOW = `<Window ${NS} Width="800" Height="450" Title="Test">
  <DockPanel Name="Root">
    <Canvas Name="Body">
      <Button x:Name="btn1" Content="A" Canvas.Left="10" Canvas.Top="20" Width="100" Height="30" Click="btn1_Click"/>
    </Canvas>
  </DockPanel>
</Window>`;

module.exports = async (t) => {
  t.section('XamlModel');

  // --- parse / find / namedControls ---
  const m = new XamlModel(WINDOW);
  const btn1 = m.findByName('btn1');
  t.ok(!!btn1, 'xaml', 'parse', 'btn1 found');
  t.equal(m.namedControls().map((c) => c.name).sort().join(','), 'Body,Root,btn1',
    'xaml', 'namedControls (window root excluded, Root DockPanel included)', 'Body + Root + btn1');

  // --- move (Canvas) ---
  const m1 = new XamlModel(WINDOW);
  const b1 = m1.findByName('btn1');
  m1.move(b1, 5, 3, { x: 10, y: 20 });
  t.equal(b1.getAttribute('Canvas.Left'), '15', 'move', 'canvas left');
  t.equal(b1.getAttribute('Canvas.Top'), '23', 'move', 'canvas top');

  // --- move (Margin) ---
  const m2 = new XamlModel(`<Window ${NS}><StackPanel><Button x:Name="btnM" Margin="10,20,10,20" Width="100" Height="30"/></StackPanel></Window>`);
  const bm = m2.findByName('btnM');
  m2.move(bm, 5, 3, { x: 10, y: 20 });
  t.equal(bm.getAttribute('Margin'), '15,23,10,20', 'move', 'margin move');

  // --- resize: all 8 corners match the webview drag-outline formula ---
  const resizeCase = (dx, dy, corner, expect) => {
    const mm = new XamlModel(WINDOW);
    const bb = mm.findByName('btn1');
    mm.resize(bb, dx, dy, { x: 10, y: 20, width: 100, height: 30 }, corner);
    const got = {
      w: bb.getAttribute('Width'), h: bb.getAttribute('Height'),
      l: bb.getAttribute('Canvas.Left'), t: bb.getAttribute('Canvas.Top')
    };
    t.equal(JSON.stringify(got), JSON.stringify(expect), 'resize', corner, `dx=${dx} dy=${dy}`);
  };
  resizeCase(5, 0, 'e', { w: '105', h: '30', l: '10', t: '20' });
  resizeCase(0, 6, 's', { w: '100', h: '36', l: '10', t: '20' });
  resizeCase(5, 6, 'se', { w: '105', h: '36', l: '10', t: '20' });
  resizeCase(5, 6, 'nw', { w: '95', h: '24', l: '15', t: '26' });
  resizeCase(-4, -4, 'n', { w: '100', h: '34', l: '10', t: '16' });
  resizeCase(-4, -4, 'w', { w: '104', h: '30', l: '6', t: '20' });
  resizeCase(3, 3, 'ne', { w: '103', h: '27', l: '10', t: '23' });
  resizeCase(3, 3, 'sw', { w: '97', h: '33', l: '13', t: '20' });
  // minimum clamp: pulling beyond 5px
  resizeCase(500, 500, 'nw', { w: '5', h: '5', l: '510', t: '520' });

  // --- resize of a control whose PARENT canvas is offset in the window (e.g. a Body canvas below
  //     a ChromeWindow title bar): the host reports window-ABSOLUTE bounds, so a west/north edge
  //     must move by the delta from the control's OWN Canvas.Left/Top attribute — never from the
  //     absolute bounds (that would drop the whole control down by the parent's offset). ---
  const mOff = new XamlModel(`<Window ${NS}><Canvas Name="Outer"><Canvas Name="Body" Canvas.Left="0" Canvas.Top="44"><Button x:Name="b" Canvas.Left="10" Canvas.Top="20" Width="100" Height="30"/></Canvas></Canvas></Window>`);
  const offBtn = mOff.findByName('b');
  mOff.resize(offBtn, 0, -12, { x: 10, y: 64, width: 100, height: 30 }, 'n'); // absolute y = 44 + 20
  t.equal(offBtn.getAttribute('Canvas.Top'), '8', 'resize-offset', 'top edge = 20 + (-12) from the ATTRIBUTE (not absolute 64 + dy)');
  t.equal(offBtn.getAttribute('Height'), '42', 'resize-offset', 'height still grows by the drag');
  const mOff2 = new XamlModel(`<Window ${NS}><Canvas Name="Outer"><Canvas Name="Body" Canvas.Left="40" Canvas.Top="44"><Button x:Name="b" Canvas.Left="10" Canvas.Top="20" Width="100" Height="30"/></Canvas></Canvas></Window>`);
  const offBtn2 = mOff2.findByName('b');
  mOff2.resize(offBtn2, 6, 0, { x: 50, y: 64, width: 100, height: 30 }, 'w'); // absolute x = 40 + 10
  t.equal(offBtn2.getAttribute('Canvas.Left'), '16', 'resize-offset', 'west edge = 10 + 6 from the ATTRIBUTE (not absolute 50 + dx)');
  t.equal(offBtn2.getAttribute('Width'), '94', 'resize-offset', 'width shrinks by the drag');
  // The same holds for a Line resized by its NW corner when its parent canvas is offset.
  const mOffL = new XamlModel(`<Window ${NS}><Canvas Name="Outer"><Canvas Name="Body" Canvas.Left="0" Canvas.Top="44"><Line x:Name="ln" Canvas.Left="10" Canvas.Top="20" StartPoint="0,0" EndPoint="100,30"/></Canvas></Canvas></Window>`);
  const offLn = mOffL.findByName('ln');
  mOffL.resizeLine(offLn, 20, 10, { x: 10, y: 64, width: 100, height: 30 }, 'nw');
  t.equal(offLn.getAttribute('Canvas.Left'), '30', 'resize-offset', 'Line NW: left = 10 + 20 (attr-relative)');
  t.equal(offLn.getAttribute('Canvas.Top'), '30', 'resize-offset', 'Line NW: top = 20 + 10 (attr-relative)');

  // --- serialize: render mode strips events, save mode keeps them ---
  const ms = new XamlModel(WINDOW);
  t.ok(!ms.serialize(false).includes('btn1_Click'), 'serialize', 'render mode strips event attrs');
  t.ok(ms.serialize(true).includes('btn1_Click'), 'serialize', 'save mode keeps event attrs');

  // --- nextName collisions ---
  t.equal(new XamlModel(WINDOW).nextName('btn1'), 'btn2', 'nextName', 'numeric suffix');
  t.equal(new XamlModel(WINDOW).nextName('FreeName'), 'FreeName', 'nextName', 'unused returns as-is');

  // --- items editing (ComboBox) ---
  const mc = new XamlModel(`<Window ${NS}><ComboBox x:Name="cb"><ComboBoxItem Content="One"/></ComboBox></Window>`);
  const cb = mc.findByName('cb');
  t.equal(mc.itemsOf(cb).length, 1, 'items', 'combo items count');
  t.equal(mc.itemText(mc.itemsOf(cb)[0]), 'One', 'items', 'combo item text');
  t.ok(mc.isPlainTextItem(mc.itemsOf(cb)[0]), 'items', 'plain text item detected');
  const it2 = mc.newItemFor(cb, 'Two');
  t.equal(it2.getAttribute('Content'), 'Two', 'items', 'new combo item Content');

  // --- addControl into Body canvas with position ---
  const ma = new XamlModel(WINDOW);
  const body = ma.findByName('Body');
  const el = ma.addControl(body, '<TextBox/>', { x: 40, y: 50 });
  t.equal(el.getAttribute('Canvas.Left'), '40', 'addControl', 'left');
  t.equal(el.getAttribute('Canvas.Top'), '50', 'addControl', 'top');
  t.equal(el.tagName, 'TextBox', 'addControl', 'element type');

  // --- single-content container wraps in a Canvas on 2nd child ---
  const mt = new XamlModel(`<Window ${NS}><TabControl x:Name="tc"><TabItem x:Name="tab1" Header="One"><Button x:Name="b1"/></TabItem></TabControl></Window>`);
  const tab1 = mt.findByName('tab1');
  mt.addControl(tab1, '<TextBox/>', { x: 5, y: 5 });
  const wrap = mt.singleChild(tab1);
  t.ok(!!wrap && wrap.tagName === 'Canvas', 'single-content', 'wrapped in Canvas');
  t.equal(mt.controlElements().filter((e) => e.parentNode === wrap).length, 2, 'single-content', 'both children inside Canvas');

  // --- ChromeWindow conversion grows height + sets title ---
  const mch = new XamlModel(WINDOW);
  t.ok(mch.convertRootToChromeWindow('My App'), 'chrome', 'conversion happened');
  t.equal(mch.root.tagName, 'chrome:ChromeWindow', 'chrome', 'root tag renamed');
  t.equal(mch.root.getAttribute('TitleBarTitle'), 'My App', 'chrome', 'title set');
  t.equal(mch.root.getAttribute('Height'), String(450 + CHROME_TITLEBAR_HEIGHT), 'chrome', 'height grown by title bar');

  // --- auto-names are assigned in memory and stripped on save ---
  const mn = new XamlModel(`<Window ${NS}><Canvas x:Name="Body"><Button/><Button/></Canvas></Window>`);
  mn.ensureNames();
  t.ok(mn.findByName('_Button1') && mn.findByName('_Button2'), 'ensureNames', 'auto names assigned');
  const saved = mn.serialize(true);
  t.ok(!saved.includes('_Button1'), 'ensureNames', 'auto names stripped on save');

  // --- addControl DataGrid declares the dg namespace ---
  const md = new XamlModel(WINDOW);
  const bodyD = md.findByName('Body');
  md.addControl(bodyD, '<dg:DataGrid/>', { x: 1, y: 1 });
  t.equal(md.root.getAttribute('xmlns:dg'), 'using:Avalonia.Controls', 'addControl', 'DataGrid xmlns:dg declared');

  // --- Grid rows/columns definitions (Grid editor) ---
  const mg = new XamlModel(`<Window ${NS}><Canvas x:Name="Body"><Grid x:Name="g1"><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/></Grid.RowDefinitions><Grid.ColumnDefinitions><ColumnDefinition Width="90"/></Grid.ColumnDefinitions><Button x:Name="b1"/></Grid></Canvas></Window>`);
  const g1 = mg.findByName('g1');
  t.equal(JSON.stringify(mg.gridSizes(g1, 'rows')), '["Auto","*"]', 'grid', 'row sizes read');
  t.equal(JSON.stringify(mg.gridSizes(g1, 'cols')), '["90"]', 'grid', 'column sizes read');

  // replace rows + cols
  mg.setGridDefinitions(g1, 'rows', ['Auto', '2*', '100']);
  mg.setGridDefinitions(g1, 'cols', ['*', '*']);
  t.equal(JSON.stringify(mg.gridSizes(g1, 'rows')), '["Auto","2*","100"]', 'grid', 'rows replaced');
  t.equal(JSON.stringify(mg.gridSizes(g1, 'cols')), '["*","*"]', 'grid', 'cols replaced');
  t.ok(mg.serialize(true).includes('RowDefinition Height="2*"'), 'grid', 'serialized rows');
  t.ok(mg.serialize(true).includes('ColumnDefinition Width="*"'), 'grid', 'serialized cols');

  // removing all definitions reverts to the implicit single cell
  mg.setGridDefinitions(g1, 'rows', []);
  mg.setGridDefinitions(g1, 'cols', []);
  t.equal(mg.gridSizes(g1, 'rows').length, 0, 'grid', 'rows cleared');
  t.equal(mg.gridSizes(g1, 'cols').length, 0, 'grid', 'cols cleared');
  t.ok(!mg.serialize(true).includes('Grid.RowDefinitions'), 'grid', 'definitions removed from XAML');

  // --- Grid: new children auto-place into the next free cell (no stacking in 0,0) ---
  const mc2 = new XamlModel(`<Window ${NS}><Canvas x:Name="Body"><Grid x:Name="g2"><Grid.RowDefinitions><RowDefinition Height="*"/><RowDefinition Height="*"/></Grid.RowDefinitions><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions></Grid></Canvas></Window>`);
  const g2 = mc2.findByName('g2');
  const cell = (el) => `${el.getAttribute('Grid.Row')},${el.getAttribute('Grid.Column')}`;
  t.equal(cell(mc2.addControl(g2, '<Button/>')), '0,0', 'grid-cell', '1st child → (0,0)');
  t.equal(cell(mc2.addControl(g2, '<Button/>')), '0,1', 'grid-cell', '2nd child → (0,1)');
  t.equal(cell(mc2.addControl(g2, '<Button/>')), '1,0', 'grid-cell', '3rd child → (1,0)');
  t.equal(cell(mc2.addControl(g2, '<Button/>')), '1,1', 'grid-cell', '4th child → (1,1)');
  t.equal(cell(mc2.addControl(g2, '<Button/>')), '0,0', 'grid-cell', 'full grid falls back to (0,0)');
  const serializedGrid = mc2.serialize(true);
  t.ok(serializedGrid.includes('Grid.Row="1"') && serializedGrid.includes('Grid.Column="1"'), 'grid-cell', 'serialized cell attrs');

  // --- Grid: a control MOVED into a Grid lands in the next free cell ---
  const mc3 = new XamlModel(`<Window ${NS}><Canvas x:Name="Body"><Grid x:Name="g3"><Grid.RowDefinitions><RowDefinition Height="*"/><RowDefinition Height="*"/></Grid.RowDefinitions><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions><Button x:Name="b1" Grid.Row="0" Grid.Column="0"/></Grid></Canvas></Window>`);
  const g3 = mc3.findByName('g3');
  const movedEl = mc3.createElement('<TextBox/>');
  mc3.moveTo(movedEl, g3);
  t.equal(cell(movedEl), '0,1', 'grid-cell', 'moved child → (0,1)');

  // --- gridCellPixelSize: pure cell-size math from preview boundaries ---
  const cells = { v: [50, 200, 350], h: [50, 150, 250] };
  t.equal(require('../../out/xamlModel.js').gridCellPixelSize(cells, 0, 0), { w: 150, h: 100 }, 'grid-cell-size', 'cell (0,0) = 150×100');
  t.equal(require('../../out/xamlModel.js').gridCellPixelSize(cells, 1, 1), { w: 150, h: 100 }, 'grid-cell-size', 'cell (1,1) = 150×100');
  t.equal(require('../../out/xamlModel.js').gridCellPixelSize(cells, 2, 0), undefined, 'grid-cell-size', 'row out of range → undefined');
  t.equal(require('../../out/xamlModel.js').gridCellPixelSize(cells, 0, 3), undefined, 'grid-cell-size', 'col out of range → undefined');
  t.equal(require('../../out/xamlModel.js').gridCellPixelSize(undefined, 0, 0), undefined, 'grid-cell-size', 'no cells → undefined');
  t.equal(require('../../out/xamlModel.js').gridCellPixelSize({ v: [0, 0], h: [0, 0] }, 0, 0), undefined, 'grid-cell-size', 'zero-size cell → undefined');

  // --- sizeElementToGridCell: an Image placed into a Grid cell gets the cell size ---
  const mi = new XamlModel(`<Window ${NS}><Canvas x:Name="Body"><Grid x:Name="g4"><Grid.RowDefinitions><RowDefinition Height="*"/><RowDefinition Height="*"/></Grid.RowDefinitions><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions></Grid></Canvas></Window>`);
  const g4 = mi.findByName('g4');
  const img = mi.addControl(g4, '<Image Width="100" Height="100" Stretch="Uniform"/>');
  t.equal(cell(img), '0,0', 'grid-img', 'image auto-placed at (0,0)');
  mi.sizeElementToGridCell(img, cells);
  t.equal(img.getAttribute('Width'), '150', 'grid-img', 'Width = cell width');
  t.equal(img.getAttribute('Height'), '100', 'grid-img', 'Height = cell height');
  // non-Image controls are untouched
  const btn = mi.addControl(g4, '<Button/>');
  mi.sizeElementToGridCell(btn, cells);
  t.equal(btn.hasAttribute('Width'), false, 'grid-img', 'Button keeps no forced Width');
  // Image NOT in a Grid (e.g. on a Canvas) keeps its own size
  const imgC = mi.addControl(mi.findByName('Body'), '<Image Width="120" Height="80"/>');
  mi.sizeElementToGridCell(imgC, cells);
  t.equal(imgC.getAttribute('Width'), '120', 'grid-img', 'Image on Canvas keeps Width');
  t.equal(imgC.getAttribute('Height'), '80', 'grid-img', 'Image on Canvas keeps Height');

  // --- syncImagesToGridCells: Images dynamically follow their cell's CURRENT size ---
  const msync = new XamlModel(`<Window ${NS}><Canvas x:Name="Body"><Grid x:Name="g5"><Grid.RowDefinitions><RowDefinition Height="*"/><RowDefinition Height="*"/></Grid.RowDefinitions><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="*"/></Grid.ColumnDefinitions><Image x:Name="imA" Grid.Row="0" Grid.Column="0" Width="150" Height="100"/><Image x:Name="imB" Grid.Row="1" Grid.Column="1" Width="150" Height="100"/></Grid></Canvas></Window>`);
  const cells2 = { g5: { v: [0, 200, 400], h: [0, 100, 200] } };
  // cell (0,0) = 200×100 → imA updates; cell (1,1) = 200×100 → imB updates
  t.equal(msync.syncImagesToGridCells(cells2), true, 'grid-img-sync', 'reports changed');
  t.equal(msync.findByName('imA').getAttribute('Width'), '200', 'grid-img-sync', 'imA Width follows cell');
  t.equal(msync.findByName('imA').getAttribute('Height'), '100', 'grid-img-sync', 'imA Height follows cell');
  t.equal(msync.findByName('imB').getAttribute('Width'), '200', 'grid-img-sync', 'imB Width follows cell');
  // a second sync with the same cells is a no-op (converged — the follow-up render stops)
  t.equal(msync.syncImagesToGridCells(cells2), false, 'grid-img-sync', 'no change when already sized');
  // a cell resize is picked up dynamically
  const cells3 = { g5: { v: [0, 250, 400], h: [0, 120, 200] } };
  t.equal(msync.syncImagesToGridCells(cells3), true, 'grid-img-sync', 'reports change after cell resize');
  t.equal(msync.findByName('imA').getAttribute('Width'), '250', 'grid-img-sync', 'imA Width follows resized cell');
  t.equal(msync.findByName('imA').getAttribute('Height'), '120', 'grid-img-sync', 'imA Height follows resized cell');
  // a non-Image control in a cell is never resized
  const mbtn = new XamlModel(`<Window ${NS}><Canvas x:Name="Body"><Grid x:Name="g6"><Grid.RowDefinitions><RowDefinition Height="*"/></Grid.RowDefinitions><Grid.ColumnDefinitions><ColumnDefinition Width="*"/></Grid.ColumnDefinitions><Button x:Name="b6" Width="40" Height="20"/></Grid></Canvas></Window>`);
  t.equal(mbtn.syncImagesToGridCells({ g6: { v: [0, 500], h: [0, 400] } }), false, 'grid-img-sync', 'Button not resized');
  t.equal(mbtn.findByName('b6').getAttribute('Width'), '40', 'grid-img-sync', 'Button keeps its Width');
  // an Image that opted OUT (in the skip set) keeps its manual size while others follow
  // (imB was 150x80 from the previous cells3 sync; it must NOT follow cells4's 100x50 cell)
  const cells4 = { g5: { v: [0, 300, 400], h: [0, 150, 200] } }; // imA cell 300x150, imB cell 100x50
  const skipB = new Set(['imB']);
  t.equal(msync.syncImagesToGridCells(cells4, skipB), true, 'grid-img-sync', 'opt-out sync reports change (imA)');
  t.equal(msync.findByName('imA').getAttribute('Width'), '300', 'grid-img-sync', 'opted-in imA follows new cell');
  t.equal(msync.findByName('imA').getAttribute('Height'), '150', 'grid-img-sync', 'opted-in imA height follows');
  t.equal(msync.findByName('imB').getAttribute('Width'), '150', 'grid-img-sync', 'opted-out imB keeps its Width');
  t.equal(msync.findByName('imB').getAttribute('Height'), '80', 'grid-img-sync', 'opted-out imB keeps its Height');

  // --- Rotate (Angle): writes/reads <X.RenderTransform><RotateTransform Angle="…"/></X.RenderTransform> ---
  const mr = new XamlModel(`<Window ${NS}><Canvas x:Name="Body"><Image x:Name="imgR" Width="100" Height="80"/></Canvas></Window>`);
  const imgR = mr.findByName('imgR');
  t.equal(mr.imageAngle(imgR), '', 'rotate', 'no angle initially');
  mr.setImageAngle(imgR, '45');
  t.equal(mr.imageAngle(imgR), '45', 'rotate', 'angle written');
  const serRot = mr.serialize(true);
  t.ok(serRot.includes('Image.RenderTransform') && serRot.includes('RotateTransform') && serRot.includes('Angle="45"'), 'rotate', 'serialized RenderTransform');
  // update the angle
  mr.setImageAngle(imgR, '90');
  t.equal(mr.imageAngle(imgR), '90', 'rotate', 'angle updated');
  // a 0 / empty angle removes the transform so the XAML stays clean
  mr.setImageAngle(imgR, '0');
  t.equal(mr.imageAngle(imgR), '', 'rotate', 'angle 0 removes transform');
  t.ok(!mr.serialize(true).includes('RenderTransform'), 'rotate', 'transform removed from XAML');
  mr.setImageAngle(imgR, '30');
  t.equal(mr.imageAngle(imgR), '30', 'rotate', 're-applied after removal');

  // --- Rectangle single 'Corner Radius' (setProperty key 'Radius'): writes BOTH RadiusX and
  //     RadiusY (they're always identical); clearing removes both so the XAML stays clean ---
  const mrad = new XamlModel(`<Window ${NS}><Canvas x:Name="Body"><Rectangle x:Name="rc1" Fill="Red" Width="100" Height="60"/></Canvas></Window>`);
  const rc1 = mrad.findByName('rc1');
  mrad.setProperty(rc1, 'Radius', '8');
  t.equal(rc1.getAttribute('RadiusX'), '8', 'radius', 'setProperty Radius writes RadiusX');
  t.equal(rc1.getAttribute('RadiusY'), '8', 'radius', 'setProperty Radius writes RadiusY (identical)');
  t.equal(rc1.hasAttribute('Radius'), false, 'radius', 'no stray Radius attribute is written');
  // update the value → both change together
  mrad.setProperty(rc1, 'Radius', '16');
  t.equal(rc1.getAttribute('RadiusX'), '16', 'radius', 'RadiusX updated');
  t.equal(rc1.getAttribute('RadiusY'), '16', 'radius', 'RadiusY updated');
  // empty value clears BOTH attributes
  mrad.setProperty(rc1, 'Radius', '');
  t.equal(rc1.hasAttribute('RadiusX'), false, 'radius', 'empty clears RadiusX');
  t.equal(rc1.hasAttribute('RadiusY'), false, 'radius', 'empty clears RadiusY');
  t.ok(!mrad.serialize(true).includes('RadiusX'), 'radius', 'no RadiusX left in serialized XAML');

  // --- Line resize: scales Start/End points (no Width/Height) so the line stretches ---
  const ml = new XamlModel(`<Window ${NS}><Canvas x:Name="Body"><Line x:Name="ln1" Canvas.Left="100" Canvas.Top="80" StartPoint="0,0" EndPoint="120,80" Stroke="Black" StrokeThickness="1"/></Canvas></Window>`);
  const ln1 = ml.findByName('ln1');
  // SE drag by +30,+20 → box becomes 150x100, end point scales 120→150, 80→100
  ml.resize(ln1, 30, 20, { x: 100, y: 80, width: 120, height: 80 }, 'se');
  t.equal(ln1.getAttribute('StartPoint'), '0,0', 'line-resize', 'SE: StartPoint pinned to origin');
  t.equal(ln1.getAttribute('EndPoint'), '150,100', 'line-resize', 'SE: EndPoint scaled to 150,100');
  t.equal(ln1.hasAttribute('Width'), false, 'line-resize', 'Line gets NO Width attribute');
  t.equal(ln1.hasAttribute('Height'), false, 'line-resize', 'Line gets NO Height attribute');
  // NW drag by +20,+10 → box left/top move + size shrinks; both points scale down and stay relative
  ml.resize(ln1, 20, 10, { x: 100, y: 80, width: 150, height: 100 }, 'nw');
  t.equal(ln1.getAttribute('Canvas.Left'), '120', 'line-resize', 'NW: Canvas.Left follows the west edge');
  t.equal(ln1.getAttribute('Canvas.Top'), '90', 'line-resize', 'NW: Canvas.Top follows the north edge');
  // 150x100 → 130x90 → scale 130/150=0.8667, 90/100=0.9 → Start(0,0)→0,0 ; End(150,100)→130,90
  t.equal(ln1.getAttribute('StartPoint'), '0,0', 'line-resize', 'NW: StartPoint stays at origin');
  t.equal(ln1.getAttribute('EndPoint'), '130,90', 'line-resize', 'NW: EndPoint scaled to 130,90');
  // a non-0 StartPoint scales too (proportional within the box)
  const ml2 = new XamlModel(`<Window ${NS}><Canvas x:Name="Body"><Line x:Name="ln2" Canvas.Left="0" Canvas.Top="0" StartPoint="20,10" EndPoint="120,90"/></Canvas></Window>`);
  const ln2 = ml2.findByName('ln2');
  ml2.resize(ln2, 40, 30, { x: 0, y: 0, width: 120, height: 90 }, 'se'); // → 160x120
  t.equal(ln2.getAttribute('StartPoint'), '26.7,13.3', 'line-resize', 'SE: StartPoint scaled proportionally');
  t.equal(ln2.getAttribute('EndPoint'), '160,120', 'line-resize', 'SE: EndPoint scaled to 160,120');
  // width/height guards: a zero-size bounds doesn't divide by zero
  const ml3 = new XamlModel(`<Window ${NS}><Canvas x:Name="Body"><Line x:Name="ln3" Canvas.Left="0" Canvas.Top="0" StartPoint="0,0" EndPoint="0,0"/></Canvas></Window>`);
  ml3.resize(ml3.findByName('ln3'), 10, 10, { x: 0, y: 0, width: 0, height: 0 }, 'se');
  t.equal(ml3.findByName('ln3').getAttribute('EndPoint'), '0,0', 'line-resize', 'zero bounds guard (no divide-by-zero)');

  // --- Line drag-POINT editing (setLineEnd): the dragged end moves, the other stays anchored ---
  const mle = new XamlModel(`<Window ${NS}><Canvas x:Name="Body"><Line x:Name="lnE" Canvas.Left="100" Canvas.Top="100" StartPoint="0,0" EndPoint="120,80"/></Canvas></Window>`);
  const lnE = mle.findByName('lnE');
  t.equal(JSON.stringify(mle.lineEndpoints(lnE)), '{"start":{"x":0,"y":0},"end":{"x":120,"y":80}}', 'line-end', 'lineEndpoints parsed');
  // drag the END by (+30,+20): EndPoint grows, StartPoint + position stay, box stays normalised
  mle.setLineEnd(lnE, 'end', 30, 20);
  t.equal(lnE.getAttribute('StartPoint'), '0,0', 'line-end', 'end-drag: StartPoint stays (anchored)');
  t.equal(lnE.getAttribute('EndPoint'), '150,100', 'line-end', 'end-drag: EndPoint moved by delta');
  t.equal(lnE.getAttribute('Canvas.Left'), '100', 'line-end', 'end-drag: Canvas.Left unchanged');
  // drag the START by (-30,+10): StartPoint goes negative → the box is re-anchored so the drawn
  // ends keep their ABSOLUTE positions (the anchored end stays put).
  mle.setLineEnd(lnE, 'start', -30, 10);
  t.equal(lnE.getAttribute('StartPoint'), '0,0', 'line-end', 'start-drag: StartPoint re-based to origin');
  t.equal(lnE.getAttribute('EndPoint'), '180,90', 'line-end', 'start-drag: EndPoint re-based (150-(-30), 100-10)');
  t.equal(lnE.getAttribute('Canvas.Left'), '70', 'line-end', 'start-drag: Canvas.Left shifted by minX (-30)');
  t.equal(lnE.getAttribute('Canvas.Top'), '110', 'line-end', 'start-drag: Canvas.Top shifted by minY (+10)');

  // --- Arc drag-POINT editing (setArcEnd / setArcRadius) + geometry ---
  const mar = new XamlModel(`<Window ${NS}><Canvas x:Name="Body"><Arc x:Name="ar1" Canvas.Left="100" Canvas.Top="100" Width="100" Height="100" StartAngle="0" SweepAngle="90" Stroke="Black"/></Canvas></Window>`);
  const ar1 = mar.findByName('ar1');
  const box = { x: 100, y: 100, width: 100, height: 100 };
  // geometry: centre = (150,150), radius 50; start at 0° = right (200,150), end at 90° = bottom (150,200)
  const g = mar.arcGeometry(ar1, box);
  t.equal(g.cx, 150, 'arc-geom', 'centre x');
  t.equal(g.cy, 150, 'arc-geom', 'centre y');
  t.equal(JSON.stringify(g.startPoint), '{"x":200,"y":150}', 'arc-geom', 'start end at 0° = right');
  t.equal(JSON.stringify(g.endPoint), '{"x":150,"y":200}', 'arc-geom', 'end at 90° = bottom');
  // drag the START end to 180° (left, 100,150): StartAngle becomes 180; sweep keeps the OTHER end
  // (at 90°) anchored → sweep = 270.
  mar.setArcEnd(ar1, 'start', 100, 150, box);
  t.equal(ar1.getAttribute('StartAngle'), '180', 'arc-end', 'start-drag: StartAngle = pointer angle');
  t.equal(ar1.getAttribute('SweepAngle'), '270', 'arc-end', 'start-drag: sweep adjusted so end stays at 90°');
  // drag the END to 180° on a FRESH 0→90 arc: start stays 0, sweep = 180.
  const mar2 = new XamlModel(`<Window ${NS}><Canvas x:Name="Body"><Arc x:Name="ar2" Canvas.Left="100" Canvas.Top="100" Width="100" Height="100" StartAngle="0" SweepAngle="90" Stroke="Black"/></Canvas></Window>`);
  const ar2 = mar2.findByName('ar2');
  mar2.setArcEnd(ar2, 'end', 100, 150, box);
  t.equal(ar2.getAttribute('StartAngle'), '0', 'arc-end', 'end-drag: StartAngle unchanged');
  t.equal(ar2.getAttribute('SweepAngle'), '180', 'arc-end', 'end-drag: sweep = pointer angle - start');
  // radius: pointer 100px right of the centre (250,150) → radius 100 → box 200x200 around (150,150)
  mar.setArcRadius(ar1, 250, 150, box);
  t.equal(ar1.getAttribute('Width'), '200', 'arc-radius', 'radius 100 → width 200');
  t.equal(ar1.getAttribute('Height'), '200', 'arc-radius', 'height 200 (stays circular)');
  t.equal(ar1.getAttribute('Canvas.Left'), '50', 'arc-radius', 'box left = centre - radius (150-100)');
  t.equal(ar1.getAttribute('Canvas.Top'), '50', 'arc-radius', 'box top = centre - radius');
};
