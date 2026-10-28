import fs from 'node:fs';
import {commentatorVolume} from '../game/commentary-audio';

export function speechEnvironment(integration:any={},exists:(file:string)=>boolean=fs.existsSync){
  const device=integration.speechDevice==='cpu'?'cpu':'auto';
  const python=typeof integration.speechPython==='string'?integration.speechPython:'';
  return {RLM_SPEECH_DEVICE:device,RLM_COMMENTARY_ENABLED:integration.commentaryEnabled===false?'0':'1',RLM_COMMENTARY_VOLUME:String(commentatorVolume(integration.commentaryVolume)),...(python&&exists(python)?{RLM_SPEECH_PYTHON:python}:{})};
}
