import {describe,it,expect} from 'vitest';
import {speechEnvironment} from '../src/main/speech-settings';

describe('caster compute preferences',()=>{
 it('defaults to automatic device detection',()=>{
  expect(speechEnvironment()).toEqual({RLM_SPEECH_DEVICE:'auto'});
 });
 it('supports CPU voices without requiring a GPU or ROCm',()=>{
  expect(speechEnvironment({speechDevice:'cpu'})).toEqual({RLM_SPEECH_DEVICE:'cpu'});
 });
 it('passes only an existing optional speech executable and keeps bot settings separate',()=>{
  expect(speechEnvironment({speechPython:'AMD/python.exe',botPack:'bots'},file=>file==='AMD/python.exe'))
   .toEqual({RLM_SPEECH_DEVICE:'auto',RLM_SPEECH_PYTHON:'AMD/python.exe'});
  expect(speechEnvironment({speechPython:'missing.exe'},()=>false)).toEqual({RLM_SPEECH_DEVICE:'auto'});
 });
});
