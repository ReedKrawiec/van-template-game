import { gravity_obj,obj } from "./object";
import { Particle, sprite } from "./sprite";
import { dimensions, obj_state, Vector } from "./state";
import { velocityCollisionCheck,check_collisions,collision_box,check_all_collisions,check_all_objects} from "./collision";
import {render_collision_box,DEBUG} from "../van";
import {Bind,control_func, exec_type} from "./controls";
import {HUD,Text, Text_Node} from "./hud";
import {audio} from "./audio"
import {game} from "../van";
import {debug_update_obj_list,root_path,path} from "../lib/debug";
import {prefabs} from "../game/objects/prefabs";

interface position{
  x:number,
  y:number
}

export function applyGravity(ob:gravity_obj,grav_const:number, grav_max:number){
  if(ob.gravity && ob.state.velocity.y > grav_max){
    ob.state.velocity.y += grav_const;
  }
}

export interface particle_entry{
  sprite:string,
  height:number,
  width:number
}

interface particles{
  [index:string]:particle_entry
}

export interface room_i<T>{
  background_url:string,
  objects:obj[]
  state:T
}

export interface object_state_config {
  type:string,
  state:obj_state,
  parameters?: unknown
}

export interface state_config{
  objects:object_state_config[]
}

export class room<T>{
  //Url to an image to be used for the room background
  background_url: string;
  background: HTMLImageElement;
  objects: obj[] = [];
  //This object contains particle definitions
  particles:particles = {};
  //This array is what actually contains the particles
  //that exists within the room.
  particles_arr: obj[] = [];
  state: T;
  binds:number[] = [];
  game:game<unknown>;
  hud:HUD;
  audio = new audio();
  //These text nodes exists in the actual room space, rather than
  //on the hud layer.
  render:boolean = true;
  text_nodes:Text[] = [];
  constructor(game:game<unknown>,config:state_config){
    this.game = game;
    for(let c of config.objects){
      //This handles loading objects from the saved json file associated with each room.
      this.addItemStateConfig(c)
    }
  }
  exportStateConfig(){
    let config:state_config = {objects:[]};
    for(let o of this.objects.filter((obj)=>obj.save_to_file)){
      //If an object has a parent object, it's a descendent of a composite object
      //The parent will spawn this object when it's instantiated, so we do
      //not have to save this instance.
        if(!o.parent){
        config.objects.push({
          type:o.constructor.name,
          state:o.state,
          parameters:o.params
        })
      }
    }
    return config;
  }
  //This handles the loading of all room sprites, and
  //any objects it contains.
  load() {
    let _this = this;
    return new Promise<void>(async (resolve, reject) => {
      let a = new Image();
      let to_await = this.objects.map((a) => a.load());
      await Promise.all(to_await);
      let p = this.background_url;
      if(DEBUG){
        p = path.join(root_path,this.background_url);
      }
      a.src = p;
      a.onerror = (() => {
        throw new Error("Loading Error:" + this.background_url);
      })
      a.onload = (async() => {
        _this.background = a;
        await this.audio.load();
        resolve();
      });
    })
  }
  //This is used while loading objects from file, it's used to dynamically load
  //objects from the room's json. If adding items within code, it's better to create
  //new instances of objects through addItem
  async addItemStateConfig(config:object_state_config){
    if(prefabs[config.type]){
      let new_obj = <obj>(new prefabs[config.type](Object.assign({},config.state),config.parameters));
      this.addItems(new_obj.combinedObjects());
    }
    else{
      console.log("UNKNOWN TYPE ATTEMPTED TO LOAD: " + config.type)
    }
  }
  //Adds the passed item to the room.
  async addItem(o:obj, list = this.objects){
    this.addItems([o],list);
  }
  //Adds every item in the passed array to the room.
  async addItems(o:obj[], list = this.objects){
    for(let ob of o){
      ob.game = this.game;
    }
    await Promise.all(o.map((a)=>a.load()));
    list.push(...o);
    if(DEBUG && list === this.objects){
      debug_update_obj_list();
    }
  }
  //Deletes the item and removes it from the room's object list
  deleteItem(id:string, list = this.objects){
    for(let a = 0;a < list.length;a++){
      if(list[a].id === id){
        list.splice(a,1)
        a--;
      }
    }
    if(DEBUG && list === this.objects){
      debug_update_obj_list();
    }
  }
  //Any particles that are needed in the room should be added to the particle array here.
  registerParticles(){

  }
  //Adds a bind that is executed when the passed key is activated
  //key examples: mouse0down KeyAdown KeyLup
  bindControl(key:string,x:exec_type,func:control_func,interval:number = 1){
    this.binds.push(Bind(key,func,x,interval)); 
  }
  //Checks for objects that have collision at the passed point
  checkCollisionsPoint(pos:Vector,exempt?:string[],list = this.objects):obj[]{
    return this.checkCollisions({x:pos.x,y:pos.y,height:0,width:0},exempt,list);
  }
  //Checks for any objects at the passed point
  checkObjectsPoint(pos:Vector,exempt?:string[],list = this.objects):obj[]{
    return this.checkObjects({x:pos.x,y:pos.y,height:0,width:0},exempt,list);
  }
  //Checks for collisions at the point that contain every tag within the second argument
  checkCollisionsPointInclusive(pos:Vector,tags?:string[],list = this.objects):obj[]{
    return this.checkCollisionsInclusive({x:pos.x,y:pos.y,height:0,width:0},tags,list);
  }
  //Checks for any objects that contain every tag within the second argument
  checkObjectsPointInclusive(pos:Vector,tags?:string[],list = this.objects):obj[]{
    return this.checkObjectsInclusive({x:pos.x,y:pos.y,height:0,width:0},tags,list);
  }
  //Checks for collisions in the box that contain the tags in the second argument
  checkCollisionsInclusive(box:collision_box,tags:string[],list=this.objects):obj[]{
    if(DEBUG){
      render_collision_box(box);
    }
    return list.filter(obj=>obj.collision && obj.collidesWithBox(box) && tags.every((val)=>obj.tags.includes(val)));
    
  }
  //Checks for any objects in the box that contain all tags in the second argument
  checkObjectsInclusive(box:collision_box,tags:string[],list=this.objects):obj[]{
    if(DEBUG){
      render_collision_box(box);
    }
    return list.filter((obj)=>obj.collidesWithBox(box) && tags.every((val)=>obj.tags.includes(val)));
    
  }
  //checks for objects with collision in the box that do not contain the tags in the second argument
  checkCollisions(box:collision_box,exempt?:string[],list=this.objects):obj[]{
    if(DEBUG){
      render_collision_box(box);
    }
    return check_all_collisions(box,list,exempt);
  }
  //checks for  any objects in the box that do not contain the tags in the second argument
  checkObjects(box:collision_box,exempt?:string[],list=this.objects):obj[]{
    if(DEBUG){
      render_collision_box(box);
    }
    return check_all_objects(box,list,exempt);
  }
  //This method should be used to call bindControl and create any needed keyBindings
  registerControls(){

  }
  cleanup(){

  }
  //The room's state updating function.
  statef(time: number) {
    for(let particle of this.particles_arr){
      particle.statef(time);
    }
    for(let text_node of this.text_nodes){
      text_node.statef(time);
    }
    let ticking_objects = this.objects.filter((o)=>o.tick_state);
    for (let a = 0; a < ticking_objects.length; a++) {
      //This function checks the velocity of every object, and moves it into it's next location
      //provided that it can fit there.
      velocityCollisionCheck(ticking_objects[a], this.objects);
      ticking_objects[a].statef(time);
    }
    if(this.game.state.cameras){
      for(let cameras of this.game.state.cameras){
        if(cameras.hud){
          cameras.hud.statef(time);
        } 
      } 
    }
  }
  emitParticle(name:string,pos:position,lifetime:number,pos_range:number){
    let state = {
      position:pos,
      velocity:{x:0,y:0},
      rotation:0,
      scaling:{width:1,height:1}
    }
    this.addItem(new Particle(this.particles[name],state,lifetime,pos_range), this.particles_arr);
  }
  getObj(id:string){
    for(let a = 0; a < this.objects.length; a++){
      if(this.objects[a].id == id){
        
        return this.objects[a];
      }
    }
    return null;
  }
  //Gets any objects that have the passed tag
  getObjByTag(tag:string):obj[]{
    return this.objects.filter((a)=>a.tags.indexOf(tag) > -1);
  }
  //renders the room's sprite
  renderf(time: number): sprite {
    return {
      sprite_sheet: this.background,
      left: 0,
      top: 0,
      sprite_height: this.background.height,
      sprite_width: this.background.width,
      opacity:1
    }
  }
}