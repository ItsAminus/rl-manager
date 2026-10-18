import fs from 'node:fs';

export function speechEnvironment(integration:any={},exists:(file:string)=>boolean=fs.existsSync){
  const device=integration.speechDevice==='cpu'?'cpu':'auto';
  const python=typeof integration.speechPython==='string'?integration.speechPython:'';
  return {RLM_SPEECH_DEVICE:device,...(python&&exists(python)?{RLM_SPEECH_PYTHON:python}:{})};
}
