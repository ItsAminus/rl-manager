#pragma once
#include <cstdint>
#include <cstddef>
#include <string>
#include "FeedNameRefresh.h"

namespace career_native_ui {
template<class Read,class Name> int32_t property(uintptr_t object,const std::string& fieldName,Read read,Name name){
    uintptr_t type=0;if(!read(object+0x50,&type,sizeof(type)))return -1;
    for(int depth=0;type&&depth<32;depth++){
        uintptr_t child=0;if(!read(type+0x88,&child,sizeof(child)))return -1;
        for(int count=0;child&&count<2048;count++){
            if(name(child)==fieldName){
                uintptr_t owner=0,kind=0;int32_t offset=-1;
                if(!read(child+0x40,&owner,sizeof(owner))||owner!=type||!read(child+0x50,&kind,sizeof(kind))||
                   name(kind).find("Property")==std::string::npos||!read(child+0x98,&offset,sizeof(offset))||offset<0||offset>65536)return -1;
                return offset;
            }
            uintptr_t next=0;if(!read(child+0x60,&next,sizeof(next))||next==child)return -1;child=next;
        }
        uintptr_t parent=0;if(!read(type+0x80,&parent,sizeof(parent))||parent==type)return -1;type=parent;
    }
    return -1;
}
template<class Read,class Name> bool derives(uintptr_t object,const std::string& owner,Read read,Name name){
    uintptr_t type=0;if(!read(object+0x50,&type,sizeof(type)))return false;
    for(int depth=0;type&&depth<32;depth++){
        if(name(type)==owner)return true;
        uintptr_t parent=0;if(!read(type+0x80,&parent,sizeof(parent))||parent==type)return false;type=parent;
    }
    return false;
}
// UE3 layouts checked against the Season 24 generated SDK. Find a method on
// the actual object's class, rather than hardcoding an executable address.
template<class Read,class Name> uintptr_t method(uintptr_t object,const std::string& owner,const std::string& function,uint16_t parameterBytes,Read read,Name name){
    uintptr_t type=0;if(!read(object+0x50,&type,sizeof(type)))return 0;
    for(int depth=0;type&&depth<32;depth++){
        if(name(type)==owner){
            uintptr_t child=0;if(!read(type+0x88,&child,sizeof(child)))return 0;
            for(int count=0;child&&count<2048;count++){
                if(name(child)==function){
                    uintptr_t fieldClass=0,outer=0;uint16_t size=0;
                    if(!read(child+0x50,&fieldClass,sizeof(fieldClass))||name(fieldClass)!="Function"||
                       !read(child+0x40,&outer,sizeof(outer))||outer!=type||
                       !read(child+0x146,&size,sizeof(size))||size!=parameterBytes)return 0;
                    return child;
                }
                uintptr_t next=0;if(!read(child+0x60,&next,sizeof(next))||next==child)return 0;child=next;
            }
            return 0;
        }
        uintptr_t parent=0;if(!read(type+0x80,&parent,sizeof(parent))||parent==type)return 0;type=parent;
    }
    return 0;
}
// FName Column is packed at byte 12, not the 16-byte alignment of a uint64_t.
// The engine consumes/copies Value synchronously; the caller retains its input.
struct SetStringParams {
    uint64_t table=0;
    int32_t row=-1;
    int32_t column=0,columnNumber=0,padding=0;
    career_feed::NameView value{};
};
static_assert(offsetof(SetStringParams,column)==0xC);
static_assert(offsetof(SetStringParams,value)==0x18);
static_assert(sizeof(SetStringParams)==0x28);
}
