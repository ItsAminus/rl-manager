"""Cache crisp UI glyphs once; Rocket League only draws small local textures."""
import json
import math
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

def prepare(target):
    target=Path(target);target.mkdir(parents=True,exist_ok=True)
    fonts=Path('C:/Windows/Fonts')
    result={'version':2}
    characters=[chr(i) for i in range(32,127)]+[chr(i) for i in range(160,256)]
    for style,name in [('regular','seguisb.ttf'),('italic','seguisbi.ttf')]:
        heights=([12,14,16,18,20,22,24,26,28,30,32,33,36,39,40,44,48,52,56,60,64,66,72,78,80,88,96]
                 if style=='regular' else [28,32,36,40,44,48,54,60,64,68,72,76,80,84,88,96,104,108,112,120,121,128,144,160,192,216,240])
        sets=[]
        for height in heights:
            # Canvas texture scaling uses point sampling on this installation.
            # Bake antialiasing at each final pixel size instead of shrinking a
            # single large glyph texture on the GPU.
            oversample=4
            font=ImageFont.truetype(str(fonts/name),round(112*height/128*oversample))
            glyphs={};tiles=[];x=y=2;row=0
            for char in (characters if style=='regular' else list('0123456789:+-? ')):
                advance=font.getlength(char)/oversample;bounds=font.getbbox(char)
                pad=max(2,round(12*height/128))
                width=max(1,math.ceil(max(advance,bounds[2]/oversample)-min(0,bounds[0]/oversample)+pad*2+1))
                if x+width+2>1024:x=2;y+=row+4;row=0
                image=Image.new('RGBA',(width*oversample,height*oversample),(0,0,0,0))
                ImageDraw.Draw(image).text((pad*oversample,round(-20*height/128*oversample)),char,font=font,fill=(255,255,255,255))
                image=image.resize((width,height),Image.Resampling.LANCZOS)
                tiles.append((image,(x,y)))
                glyphs[char]={'advance':advance,'pad':pad,'x':x,'y':y,'width':width,'height':height}
                x+=width+4;row=max(row,height)
            atlas=Image.new('RGBA',(1024,y+row+2),(0,0,0,0))
            for image,where in tiles:atlas.paste(image,where)
            filename=f'{style}-native-{height}.png';atlas.save(target/filename)
            sets.append({'height':height,'file':filename,'glyphs':glyphs})
        result[style]=sets
    (target/'glyphs.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
    return result

if __name__=='__main__':
    prepare(Path(__file__).parent/'build'/'fonts')
    print('Cached regular and italic broadcast fonts')
