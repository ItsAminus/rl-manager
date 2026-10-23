#include "../ScoreboardRows.h"
#include "../FeedNameRefresh.h"
#include "../NativeUI.h"
#include "../NativeScoreboard.h"
#include "../NativeNameBindings.h"
#include "../HudWork.h"
#include <array>
#include <cassert>
#include <cstring>
#include <iostream>
using namespace career_scoreboard;
static void cachedNativeNamesTests(){
    using namespace career_names;
    Bindings bindings;Binding a;a.object=1000;a.pri=2000;a.nativeId="2000";a.career="zen";a.text=L"zen";
    const Key first{10,20,3},second{11,20,3},otherTable{10,21,3};
    assert(bindings.remember(first,a));assert(!bindings.remember(first,a));
    Binding b=a;b.object=1001;b.pri=2001;b.career="Oski";b.text=L"Oski";
    assert(bindings.remember(second,b));
    Binding c=b;c.object=1002;c.pri=2002;c.career="archie";assert(bindings.remember(otherTable,c));
    assert(bindings.find(first)->career=="zen"&&bindings.find(second)->career=="Oski"&&bindings.find(otherTable)->career=="archie");
    assert(!bindings.find({99,20,3}));
    // A recycled native row must not retain the previous player's text.
    Binding recycled=a;recycled.object=1003;recycled.pri=2003;recycled.career="nass";
    assert(bindings.remember(first,recycled));assert(!bindings.findObject(a.object));
    assert(bindings.findObject(recycled.object)->career=="nass");
    const Key moved{10,20,4};assert(bindings.remember(moved,recycled));assert(!bindings.find(first));
    // Steady-state routing validates the recorded car links with three bounded
    // pointer reads, independent of the six-player roster and class field graph.
    Binding plate;plate.object=3000;plate.pri=2000;plate.component=4000;plate.car=5000;
    plate.componentOffset=16;plate.carOffset=24;plate.carComponentOffset=32;
    std::unordered_map<uintptr_t,uintptr_t> memory{{3016,4000},{4024,5000},{5032,4000}};size_t reads=0;
    auto read=[&](uintptr_t at,void* out,size_t bytes){reads++;auto it=memory.find(at);if(it==memory.end()||bytes!=sizeof(uintptr_t))return false;std::memcpy(out,&it->second,bytes);return true;};
    for(int i=0;i<10000;i++)assert(valid(plate,read));assert(reads==30000);
    memory[5032]=4001;assert(!valid(plate,read));memory[5032]=4000;
    memory[3016]=4001;assert(!valid(plate,read));
    bindings.clear();assert(bindings.empty()&&!bindings.find(moved)&&!bindings.findObject(1003));
    career_work::Counter counter;counter.record(5);counter.record(20);counter.record(7);
    assert(counter.calls==3&&counter.micros==32&&counter.worst==20);
}
static void nativePublicationTests(){
    // A real class/field graph is required: a same-name property, inherited
    // method with the wrong parameters, or a stale unrelated object cannot
    // be invoked as SetStringValue.
    std::array<unsigned char,512> object{},type{},field{},functionClass{};
    auto at=[](auto& buffer){return reinterpret_cast<uintptr_t>(buffer.data());};
    auto put=[](uintptr_t address,auto value){std::memcpy(reinterpret_cast<void*>(address),&value,sizeof(value));};
    const auto o=at(object),t=at(type),f=at(field),c=at(functionClass);
    put(o+0x50,t);put(t+0x88,f);put(f+0x50,c);put(f+0x40,t);put(f+0x146,uint16_t(40));
    auto read=[&](uintptr_t address,void* out,size_t size){
        for(auto base:{o,t,f,c})if(address>=base&&address+size<=base+512){std::memcpy(out,reinterpret_cast<void*>(address),size);return true;}return false;
    };
    auto name=[&](uintptr_t address){return address==t?std::string("GFxDataStore_X"):address==f?std::string("SetStringValue"):address==c?std::string("Function"):std::string{};};
    assert(career_native_ui::method(o,"GFxDataStore_X","SetStringValue",40,read,name)==f);
    assert(career_native_ui::derives(o,"GFxDataStore_X",read,name));
    assert(!career_native_ui::derives(o,"UnrelatedHUD",read,name));
    // Gameplay uses GFxHUD_Soccar/Spectator subclasses, not the base HUD.
    std::array<unsigned char,512> derived{};const auto d=at(derived);put(d+0x50,c);put(c+0x80,t);
    auto childRead=[&](uintptr_t address,void* out,size_t size){if(address>=d&&address+size<=d+512){std::memcpy(out,reinterpret_cast<void*>(address),size);return true;}return read(address,out,size);};
    assert(career_native_ui::derives(d,"GFxDataStore_X",childRead,name));
    assert(!career_native_ui::method(o,"OtherStore","SetStringValue",40,read,name));
    put(f+0x146,uint16_t(32));assert(!career_native_ui::method(o,"GFxDataStore_X","SetStringValue",40,read,name));
    put(f+0x146,uint16_t(40));put(f+0x40,o);assert(!career_native_ui::method(o,"GFxDataStore_X","SetStringValue",40,read,name));
    put(f+0x40,t);put(f+0x50,o);assert(!career_native_ui::method(o,"GFxDataStore_X","SetStringValue",40,read,name));
    put(f+0x50,c);
    auto propertyName=[&](uintptr_t address){return address==t?std::string("GFxData_Nameplate_TA"):address==f?std::string("NameplateComponent"):address==c?std::string("ObjectProperty"):std::string{};};
    // Runtime layout changes must use the engine's field metadata. The old
    // SDK's D8 component offset failed silently on the running game.
    put(f+0x98,int32_t(0xE0));
    assert(career_native_ui::property(o,"NameplateComponent",read,propertyName)==0xE0);
    assert(career_native_ui::property(d,"NameplateComponent",childRead,propertyName)==0xE0);
    assert(career_native_ui::property(o,"MissingField",read,propertyName)==-1);
    put(f+0x40,o);assert(career_native_ui::property(o,"NameplateComponent",read,propertyName)==-1);
    put(f+0x40,t);put(f+0x98,int32_t(-1));assert(career_native_ui::property(o,"NameplateComponent",read,propertyName)==-1);
    put(f+0x98,int32_t(0xE0));assert(career_native_ui::property(o,"NameplateComponent",read,name)==-1);
    wchar_t pro[]=L"ExoTiiK";
    career_native_ui::SetStringParams params;params.table=123;params.row=4;params.column=789;params.value={reinterpret_cast<uintptr_t>(pro),8,8};
    uint64_t table=0;int row=0,column=0;career_feed::NameView text{};
    auto bytes=reinterpret_cast<const unsigned char*>(&params);
    std::memcpy(&table,bytes,8);std::memcpy(&row,bytes+8,4);std::memcpy(&column,bytes+12,4);std::memcpy(&text,bytes+24,16);
    assert(table==123&&row==4&&column==789&&std::wstring(reinterpret_cast<wchar_t*>(text.text))==L"ExoTiiK");
}
static void feedNameRefreshTests(){
    using career_feed::NameView;
    auto read=[](uintptr_t address,void* out,size_t size){std::memcpy(out,reinterpret_cast<void*>(address),size);return true;};
    auto write=[](uintptr_t address,const void* in,size_t size){std::memcpy(reinterpret_cast<void*>(address),in,size);return true;};
    wchar_t buffer[32]=L"archie";
    NameView field{reinterpret_cast<uintptr_t>(buffer),7,32};
    const auto address=reinterpret_cast<uintptr_t>(&field);
    // Regression: the engine's compare-and-publish updater skipped unchanged
    // "archie", leaving Flash's "Necto". The refresh forces that copy to run.
    std::wstring flash=L"Necto";
    career_feed::NameRefresh refresh;
    assert(refresh.begin(address,read,write));
    if(std::wstring(reinterpret_cast<wchar_t*>(field.text))!=L"archie"){
        std::wcscpy(buffer,L"archie");field.count=7;flash=buffer;
    }
    refresh.finish(read,write);
    assert(flash==L"archie"&&field.text==reinterpret_cast<uintptr_t>(buffer)&&field.count==7&&field.capacity==32);
    // No native updater: restore the original engine buffer and descriptor.
    assert(refresh.begin(address,read,write));refresh.finish(read,write);
    assert(std::wstring(buffer)==L"archie"&&field.count==7&&field.capacity==32);
    // A longer pro name reallocates the destination. Never read/free/write the
    // old allocation after the engine takes ownership of its new result.
    assert(refresh.begin(address,read,write));
    wchar_t larger[64]=L"a-much-longer-career-name";
    const auto oldBuffer=field.text;
    field={reinterpret_cast<uintptr_t>(larger),25,64};
    auto guardedRead=[&](uintptr_t at,void* out,size_t size){assert(at!=oldBuffer);return read(at,out,size);};
    refresh.finish(guardedRead,write);
    assert(field.text==reinterpret_cast<uintptr_t>(larger)&&std::wstring(larger)==L"a-much-longer-career-name");
    // A nested refresh doesn't overwrite the outer call's saved contents.
    std::wcscpy(buffer,L"Oski");field={reinterpret_cast<uintptr_t>(buffer),5,32};
    career_feed::NameRefresh outer,inner;
    assert(outer.begin(address,read,write));assert(!inner.begin(address,read,write));
    inner.finish(read,write);outer.finish(read,write);
    assert(std::wstring(buffer)==L"Oski"&&field.count==5);
    // Native GetPlayerName return values retain their allocator, including
    // when a short hosted policy name maps to a longer career gamertag.
    std::wcscpy(buffer,L"Byte");field={reinterpret_cast<uintptr_t>(buffer),5,32};
    const auto engineAllocation=field.text;
    assert(career_feed::replaceResult(address,L"archie",read,write));
    assert(std::wstring(buffer)==L"archie"&&field.count==7&&field.capacity==32&&field.text==engineAllocation);
    field.capacity=7;
    assert(!career_feed::replaceResult(address,L"a longer career name",read,write));
    assert(std::wstring(buffer)==L"archie"&&field.count==7&&field.capacity==7);
    field.capacity=32;
    auto failHeader=[&](uintptr_t at,const void* in,size_t size){return at!=address&&write(at,in,size);};
    assert(!career_feed::replaceResult(address,L"zen",read,failHeader));
    assert(std::wstring(buffer)==L"archie"&&field.count==7);
    assert(!career_feed::replaceResult(address,std::wstring(L"bad\0name",8),read,write));
    field.count=33;assert(!career_feed::replaceResult(address,L"zen",read,write));
    field={0,1,32};assert(!career_feed::replaceResult(address,L"zen",read,write));
    std::wcscpy(buffer,L"Oski");field={reinterpret_cast<uintptr_t>(buffer),5,32};
    // Malformed descriptors and write failures leave names untouched.
    field.count=33;assert(!refresh.begin(address,read,write));field.count=5;
    auto failDescriptor=[&](uintptr_t at,const void* in,size_t size){return at!=address&&write(at,in,size);};
    assert(!refresh.begin(address,read,failDescriptor));
    assert(std::wstring(buffer)==L"Oski"&&field.count==5);
}
static void nativeScoreboardStyleTests(){
    using namespace career_native_scoreboard;
    std::unordered_map<std::string,Style> catalog;
    catalog[normalized("RLCS 2026 CONTENDER")]={0xFF123456,0xFF654321};
    catalog[normalized("RLCS 2024 CONTENDER")]={0xFF112233,0xFF332211};
    catalog[normalized("Standard title")]={0xFFEEEEEE,0};
    assert(style(catalog,"rlcs 2026 contender").glow==0xFF654321);
    assert(style(catalog,"RLCS 2028 CONTENDER").color==0xFF123456);
    assert(style(catalog,"Standard title").glow==0);
    assert(style(catalog,"Unknown award").glow==0);
    assert(style(catalog,"RLCS 2028 WORLD CHAMPION").glow==0);
    TextureParams texture;texture.table=42;texture.row=3;texture.column=71;texture.value=0x12345678;
    IntParams color;color.table=42;color.row=3;color.column=72;color.value=(int32_t)0xFFAABBCC;
    uint64_t copy=0;std::memcpy(&copy,reinterpret_cast<char*>(&texture)+0x18,8);assert(copy==texture.value);
    uint32_t packed=0;std::memcpy(&packed,reinterpret_cast<char*>(&color)+0x14,4);assert(packed==0xFFAABBCC);
}
int main(){
    using career_native_scoreboard::replaceToken;
    assert(replaceToken("Bot_Byte (2),Bot_Byte,Epic|human|0","Bot_Byte","Unknown|42|0")=="Bot_Byte (2),Unknown|42|0,Epic|human|0");
    assert(replaceToken("[\"Bot_Byte\",\"Bot_Byte (2)\"]","Bot_Byte","Unknown|42|0")=="[\"Unknown|42|0\",\"Bot_Byte (2)\"]");
    assert(replaceToken("Bot_Byte_extra;Bot_Byte","Bot_Byte","Unknown|42|0")=="Bot_Byte_extra;Unknown|42|0");
    assert(replaceToken("Bot_Byte","","Unknown|42|0")=="Bot_Byte");
    nativeScoreboardStyleTests();
    cachedNativeNamesTests();
    nativePublicationTests();
    feedNameRefreshTests();
    assert(playerNameBinding("PlayerName",3,3,12,12,"BonkDaddy","BonkDaddy","zen"));
    assert(playerNameBinding("PlayerName",4,4,12,12,"Necto (2)","Necto (2)","Oski"));
    assert(!playerNameBinding("PlayerIDString",3,3,12,12,"BonkDaddy","BonkDaddy","zen"));
    assert(!playerNameBinding("PlayerName",3,4,12,12,"Necto","Necto","Oski"));
    assert(!playerNameBinding("PlayerName",3,3,12,13,"Necto","Necto","Oski"));
    assert(playerNameBinding("PlayerName",3,3,12,12,"old-bot","Necto","Oski"));
    assert(playerNameBinding("PlayerName",3,3,12,12,"NECTO","reeho!","reeho!"));
    assert(!playerNameBinding("PlayerName",3,4,12,12,"NECTO","reeho!","reeho!"));
    assert(!playerNameBinding("PlayerName",-1,-1,12,12,"Necto","Necto","Oski"));
    assert(portraitInitial("zen")=="Z"&&portraitInitial("Oski")=="O");
    assert(portraitInitial("")=="?"&&portraitInitial("éclair")=="é");
    assert(hasSortedToken("Bot_Byte (2),Bot_Byte,Epic123","Bot_Byte"));
    assert(!hasSortedToken("Bot_Byte (2),Epic123","Bot_Byte"));
    std::vector<NativePlayer> native={{"zen","Bot_zen",0},{"nass","Bot_nass",0},{"my-account","Epic123",1}};
    std::vector<CareerPlayer> career={{0,0,"zen","zen-id","zen","zen.png","World Champion"},
        {1,0,"nass","nass-id","nass","nass.png","1v1 Champion"},
        {3,1,"my-account","vatira-id","Vatira","vatira.png","Major Champion"}};
    // Both bots can be Nexto: no bot-engine key exists in the mapping.
    auto rows=matchRows(native,career,"Bot_nass,Bot_zen,Epic123");
    assert(rows.size()==3);
    assert(rows[0].player.playerId=="nass-id"&&rows[0].player.photo=="nass.png"&&rows[0].teamRow==0);
    assert(rows[1].player.playerId=="zen-id"&&rows[1].player.photo=="zen.png"&&rows[1].teamRow==1);
    assert(rows[2].player.gamertag=="Vatira"&&rows[2].player.title=="Major Champion"&&rows[2].teamRow==0);
    auto reordered=matchRows(native,career,"Bot_zen,Epic123,Bot_nass");
    assert(reordered[0].player.photo=="zen.png"&&reordered[0].teamRow==0);
    assert(reordered[2].player.photo=="nass.png"&&reordered[2].teamRow==1);
    // Unknown IDs / partial rosters / previous games suppress the decoration.
    assert(matchRows(native,career,"Bot_zen,Bot_other,Epic123").empty());
    auto previous=career;previous[1].name="old-player";
    assert(matchRows(native,previous,"Bot_nass,Bot_zen,Epic123").empty());
    assert(matchRows(native,career,"Bot_nass_extra,Bot_zen,Epic123").empty());
    auto ambiguous=career;ambiguous.push_back(career[0]);
    assert(matchRows(native,ambiguous,"Bot_nass,Bot_zen,Epic123").empty());
    // Name collisions across teams still resolve to their separate career IDs.
    auto sameNative=native;sameNative[2].name="zen";
    auto sameCareer=career;sameCareer[2].name="zen";
    assert(matchRows(sameNative,sameCareer,"Bot_nass,Bot_zen,Epic123")[2].player.playerId=="vatira-id");
    // Hosted copies of one engine retain independent career identities.
    std::vector<NativePlayer> host={{"Byte","Bot_Byte",0,"10"},{"Byte (2)","Bot_Byte (2)",0,"20"}};
    std::vector<CareerPlayer> roles={{0,0,"Byte","zen-id","zen","zen.png","World Champion","10"},
        {1,0,"Byte (2)","nass-id","nass","nass.png","1v1 Champion","20"}};
    auto hostRows=matchRows(host,roles,"Bot_Byte (2),Bot_Byte");
    assert(hostRows.size()==2&&hostRows[0].player.playerId=="nass-id");
    roles[1].nativeId="30";
    assert(matchRows(host,roles,"Bot_Byte (2),Bot_Byte").empty());
    auto hd=layout(1920,1080,1,3,3),low=layout(1280,720,1,3,3);
    assert(std::abs(low.x-hd.x*2/3)<.01f&&std::abs(low.orangeY-hd.orangeY*2/3)<.01f);
    auto smallerUI=layout(1920,1080,.8f,3,3);
    assert(std::abs(smallerUI.spacing-hd.spacing*.8f)<.01f);
    assert(hd.blueY+2*hd.spacing+48*hd.unit<hd.orangeY);
    std::cout<<"PASS: feed republishing, destination ownership/rollback, role-specific portraits/titles, native order, human role, stale/ambiguous data, resolution and UI scaling\n";
}
