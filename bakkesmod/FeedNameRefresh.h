#pragma once
#include <cstdint>
#include <vector>
#include <string>

namespace career_feed {
struct NameView {uintptr_t text;int32_t count,capacity;};
// Output values must keep the engine's allocation. In particular, never return
// a plugin-owned FString: the caller will destroy it with the engine allocator.
template<class Read,class Write> bool replaceResult(uintptr_t field,const std::wstring& name,Read read,Write write){
    NameView value{};
    if(name.empty()||name.size()>128||name.find(L'\0')!=std::wstring::npos||!read(field,&value,sizeof(value))||!value.text||
       value.count<1||value.count>value.capacity||value.capacity>1024||name.size()+1>static_cast<size_t>(value.capacity))return false;
    std::vector<wchar_t> original(value.count);
    if(!read(value.text,original.data(),original.size()*sizeof(wchar_t))||original.back()!=0)return false;
    std::vector<wchar_t> text(name.begin(),name.end());text.push_back(0);
    if(!write(value.text,text.data(),text.size()*sizeof(wchar_t)))return false;
    const auto saved=value;value.count=static_cast<int32_t>(text.size());
    if(write(field,&value,sizeof(value)))return true;
    write(saved.text,original.data(),original.size()*sizeof(wchar_t));return false;
}
// Invalidate an engine-owned destination only across its synchronous updater.
// Never lend an engine destination a plugin allocation: FString assignment may
// free or resize it. Read/write callbacks make failure and reallocation testable.
class NameRefresh {
    uintptr_t address=0;
    NameView original{};
    std::vector<wchar_t> contents;
public:
    template<class Read,class Write> bool begin(uintptr_t field,Read read,Write write){
        if(address||!read(field,&original,sizeof(original))||!original.text||
           original.count<2||original.count>original.capacity||original.capacity>1024)return false;
        contents.resize(original.count);
        if(!read(original.text,contents.data(),contents.size()*sizeof(wchar_t))||contents.back()!=0)return false;
        wchar_t empty=0;
        if(!write(original.text,&empty,sizeof(empty)))return false;
        auto invalid=original;invalid.count=1;
        if(!write(field,&invalid,sizeof(invalid))){write(original.text,contents.data(),sizeof(wchar_t));return false;}
        address=field;return true;
    }
    template<class Read,class Write> void finish(Read read,Write write){
        if(!address)return;
        NameView current{};wchar_t first=1;
        // A successful updater owns its result, including a reallocated buffer.
        // Restore only our still-empty original buffer when no update occurred.
        if(read(address,&current,sizeof(current))&&current.text==original.text&&
           current.capacity==original.capacity&&current.count==1&&
           read(current.text,&first,sizeof(first))&&first==0&&
           write(current.text,contents.data(),contents.size()*sizeof(wchar_t)))
            write(address,&original,sizeof(original));
        address=0;contents.clear();
    }
};
}
