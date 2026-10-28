import {describe,it,expect} from 'vitest';
import {speechEnvironment} from '../src/main/speech-settings';

describe('caster compute preferences',()=>{
 it('mutes speech independently of Python, bots and crowd settings',()=>{
  expect(speechEnvironment({commentaryEnabled:false,speechDevice:'cpu'})).toMatchObject({RLM_COMMENTARY_ENABLED:'0',RLM_SPEECH_DEVICE:'cpu'});
 });
 it('defaults to automatic device detection',()=>{
  expect(speechEnvironment()).toEqual({RLM_COMMENTARY_ENABLED:'1',RLM_COMMENTARY_VOLUME:'1',RLM_SPEECH_DEVICE:'auto'});
 });
 it('supports CPU voices without requiring a GPU or ROCm',()=>{
  expect(speechEnvironment({speechDevice:'cpu'})).toEqual({RLM_COMMENTARY_ENABLED:'1',RLM_COMMENTARY_VOLUME:'1',RLM_SPEECH_DEVICE:'cpu'});
 });
 it('passes only an existing optional speech executable and keeps bot settings separate',()=>{
  expect(speechEnvironment({speechPython:'AMD/python.exe',botPack:'bots'},file=>file==='AMD/python.exe'))
   .toEqual({RLM_COMMENTARY_ENABLED:'1',RLM_COMMENTARY_VOLUME:'1',RLM_SPEECH_DEVICE:'auto',RLM_SPEECH_PYTHON:'AMD/python.exe'});
  expect(speechEnvironment({speechPython:'missing.exe'},()=>false)).toEqual({RLM_COMMENTARY_ENABLED:'1',RLM_COMMENTARY_VOLUME:'1',RLM_SPEECH_DEVICE:'auto'});
 });
});

it('passes an independent saved caster volume to the match process',()=>{
 expect(speechEnvironment({commentaryVolume:.35})).toMatchObject({RLM_COMMENTARY_VOLUME:'0.35'});
 expect(speechEnvironment({commentaryVolume:0})).toMatchObject({RLM_COMMENTARY_VOLUME:'0',RLM_COMMENTARY_ENABLED:'1'});
 expect(speechEnvironment({commentaryVolume:NaN})).toMatchObject({RLM_COMMENTARY_VOLUME:'1'});
 expect(speechEnvironment({commentaryVolume:9})).toMatchObject({RLM_COMMENTARY_VOLUME:'1'});
});
