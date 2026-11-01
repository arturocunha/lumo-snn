import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib';
import Cairo from 'cairo';
/** Janela nativa RGBA: pixels externos transparentes, sem decoração ou sombra. */
export class Pet {
 window:any; timer=0; frame=0; surface:any; dragging=false;
 constructor(onClose:()=>void){
  const screen=Gdk.Screen.get_default(),visual=screen.get_rgba_visual();
  if(!visual||!screen.is_composited())throw Error('Esta sessão não oferece transparência RGBA com composição.');
  this.window=new Gtk.Window({title:'Companheiro — personagem',decorated:false,resizable:false,app_paintable:true,accept_focus:false,focus_on_map:false,skip_taskbar_hint:true,skip_pager_hint:true});
  const w=this.window;w.set_visual(visual);w.set_keep_above(true);w.set_default_size(140,100);
  const css=new Gtk.CssProvider();css.load_from_data('window {background:transparent;box-shadow:none;border:none;}');w.get_style_context().add_provider(css,600);
  w.add_events(Gdk.EventMask.BUTTON_PRESS_MASK|Gdk.EventMask.BUTTON_RELEASE_MASK);
  w.connect('draw',(_:any,cr:any)=>{cr.setOperator(Cairo.Operator.SOURCE);cr.setSourceSurface(this.surface,0,0);cr.paint();return true;});
  const menu=new Gtk.Menu();const hide=new Gtk.MenuItem({label:'Ocultar personagem'});hide.connect('activate',()=>w.destroy());menu.append(hide);menu.show_all();
  w.connect('button-press-event',(_:any,e:any)=>{const button=e.get_button()[1];if(button===1){this.dragging=true;const [,x,y]=e.get_root_coords();w.begin_move_drag(1,x,y,e.get_time());}else if(button===3)menu.popup_at_pointer(e);return true;});
  w.connect('button-release-event',()=>{this.dragging=false;return false;});
  w.connect('destroy',()=>{if(this.timer)GLib.source_remove(this.timer);this.timer=0;this.window=null;onClose();});
  this.paint();w.connect('map-event',()=>{this.paint();print('Personagem: RGBA 32 bits, sem decoração, máscara de entrada ativa.');});w.show_all();
  this.timer=GLib.timeout_add(GLib.PRIORITY_DEFAULT,80,()=>{if(!this.dragging){this.frame++;this.paint();w.queue_draw();}return true;});
 }
 paint(){
  const s=new Cairo.ImageSurface(Cairo.Format.ARGB32,140,100),cr=new Cairo.Context(s);
  cr.setOperator(Cairo.Operator.SOURCE);cr.setSourceRGBA(0,0,0,0);cr.paint();cr.setOperator(Cairo.Operator.OVER);
  const x=70+24*Math.sin(this.frame/20),step=this.frame%12<6?5:-5;
  cr.setSourceRGB(.655,.545,.98);cr.arc(x,38,20,0,Math.PI*2);cr.fill();
  cr.setSourceRGB(.08,.07,.13);for(const eye of [-8,8]){cr.arc(x+eye,32,2,0,Math.PI*2);cr.fill();}
  cr.setLineWidth(5);cr.setLineCap(Cairo.LineCap.ROUND);
  for(const side of [-1,1]){cr.moveTo(x+side*10,56);cr.lineTo(x+side*(12-step),75);cr.stroke();}
  cr.$dispose();this.surface=s;
  // Região acompanha o círculo e as pernas; fora dela o mouse passa ao desktop.
  const region=new Cairo.Region();
  for(let y=18;y<59;y++){const half=Math.sqrt(Math.max(0,400-(y-38)**2));region.unionRectangle({x:Math.floor(x-half),y,width:Math.max(1,Math.ceil(half*2)+1),height:1});}
  for(const side of [-1,1])for(let y=55;y<=78;y++){const t=Math.max(0,Math.min(1,(y-56)/19)),px=x+side*(10+(2-step)*t);region.unionRectangle({x:Math.floor(px-3),y,width:7,height:1});}
  this.window.input_shape_combine_region(region);
 }
 close(){this.window?.destroy();}
}
