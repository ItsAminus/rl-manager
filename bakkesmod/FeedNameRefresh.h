#pragma once
#include <cstdint>
#include <vector>

namespace career_feed {
struct NameView {uintptr_t text;int32_t count,capacity;};
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
