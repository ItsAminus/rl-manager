#pragma once
#include <cstdint>
#include <cstddef>
#include <string>
#include <unordered_map>
#include <cctype>

namespace career_native_scoreboard {
// Native GFxDataStore methods pack FName Column at offset 12.
struct TextureParams {
    uint64_t table=0;int32_t row=-1,column=0,columnNumber=0,padding=0;
    uintptr_t value=0;
};
struct IntParams {
    uint64_t table=0;int32_t row=-1,column=0,columnNumber=0,value=0;
};
static_assert(offsetof(TextureParams,value)==0x18&&sizeof(TextureParams)==0x20);
static_assert(offsetof(IntParams,value)==0x14&&sizeof(IntParams)==0x18);
// Substitute whole presentation keys only; similarly named bot instances remain distinct.
inline std::string replaceToken(std::string list,const std::string& from,const std::string& to){
    if(from.empty()||to.empty()||from==to)return list;
    auto boundary=[](char c){return c==','||c==';'||c=='|'||c=='"'||c=='['||c==']';};
    size_t at=0;
    while((at=list.find(from,at))!=std::string::npos){
        const auto end=at+from.size();
        if((at==0||boundary(list[at-1]))&&(end==list.size()||boundary(list[end]))){list.replace(at,from.size(),to);at+=to.size();}
        else at=end;
    }
    return list;
}
struct Style {uint32_t color=0xFFFFFFFF,glow=0;};
inline std::string normalized(const std::string& text){
    std::string result;for(unsigned char c:text)if(std::isalnum(c))result+=(char)std::toupper(c);return result;
}
inline std::string family(const std::string& text){
    auto key=normalized(text);
    for(size_t i=0;i+3<key.size();){
        if(key[i]=='2'&&key[i+1]=='0'&&std::isdigit((unsigned char)key[i+2])&&std::isdigit((unsigned char)key[i+3]))key.erase(i,4);
        else i++;
    }return key;
}
// Exact native definitions take priority. Career awards in later years may
// reuse the same native title family, preserving its real colour/glow style.
inline Style style(const std::unordered_map<std::string,Style>& catalog,const std::string& title){
    auto key=normalized(title);auto found=catalog.find(key);if(found!=catalog.end())return found->second;
    const auto wanted=family(title);const Style* selected=nullptr;std::string selectedKey;
    for(const auto& entry:catalog)if(family(entry.first)==wanted&&entry.first>selectedKey){selected=&entry.second;selectedKey=entry.first;}
    return selected?*selected:Style{};
}
}
