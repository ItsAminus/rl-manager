#pragma once
#include <cstdint>
#include <functional>
#include <string>
#include <unordered_map>

namespace career_names {
// Native table row indices are only unique within their datastore and table.
struct Key {
    uintptr_t store=0;uint64_t table=0;int32_t row=-1;
    bool operator==(const Key& other)const{return store==other.store&&table==other.table&&row==other.row;}
};
struct Hash {
    size_t operator()(const Key& key)const{
        auto seed=std::hash<uintptr_t>{}(key.store);
        seed^=std::hash<uint64_t>{}(key.table)+(seed<<6)+(seed>>2);
        return seed^(std::hash<int32_t>{}(key.row)+(seed<<6)+(seed>>2));
    }
};
struct Binding {
    uintptr_t object=0,pri=0,component=0,car=0;
    int componentOffset=-1,carOffset=-1,carComponentOffset=-1;
    std::string nativeId,career;
    std::wstring text;
};
class Bindings {
    std::unordered_map<Key,Binding,Hash> byKey;
    std::unordered_map<uintptr_t,Key> byObject;
public:
    void clear(){byKey.clear();byObject.clear();}
    bool empty()const{return byKey.empty();}
    bool remember(const Key& key,Binding binding){
        auto prior=byObject.find(binding.object);
        if(prior!=byObject.end()){
            auto found=byKey.find(prior->second);
            if(prior->second==key&&found!=byKey.end()&&found->second.pri==binding.pri&&
               found->second.component==binding.component&&found->second.car==binding.car&&found->second.career==binding.career)return false;
            byKey.erase(prior->second);byObject.erase(prior);
        }
        auto conflict=byKey.find(key);if(conflict!=byKey.end())byObject.erase(conflict->second.object);
        byObject[binding.object]=key;byKey[key]=std::move(binding);return true;
    }
    const Binding* find(const Key& key)const{
        auto found=byKey.find(key);return found==byKey.end()?nullptr:&found->second;
    }
    const Binding* findObject(uintptr_t object)const{
        auto found=byObject.find(object);return found==byObject.end()?nullptr:find(found->second);
    }
};
template<class Read> bool valid(const Binding& binding,Read read){
    uintptr_t current=0;
    if(!binding.component)return read(binding.object+0x140,&current,sizeof(current))&&current==binding.pri;
    if(binding.componentOffset<0||binding.carOffset<0||binding.carComponentOffset<0)return false;
    return read(binding.object+binding.componentOffset,&current,sizeof(current))&&current==binding.component&&
        read(binding.component+binding.carOffset,&current,sizeof(current))&&current==binding.car&&
        read(binding.car+binding.carComponentOffset,&current,sizeof(current))&&current==binding.component;
}
// A row object can survive while its datastore slot changes. A remembered
// object/component pair alone must not authorize writes to its former slot.
template<class Read> bool current(const Key& key,const Binding& binding,Read read){
    uint64_t table=0;int32_t row=-1;uintptr_t shell=0,store=0;
    return read(binding.object+0x60,&table,sizeof(table))&&table==key.table&&
        read(binding.object+0x90,&row,sizeof(row))&&row==key.row&&
        read(binding.object+0x88,&shell,sizeof(shell))&&shell&&
        read(shell+0xD0,&store,sizeof(store))&&store==key.store&&valid(binding,read);
}
}
