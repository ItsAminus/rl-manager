#include "../CareerComms.h"
#include <cassert>
int main(){
    using namespace career_comms;
    assert(selection("Group1Message5")==4);assert(selection("Group1Message4")==3);
    assert(selection("Take the shot!")==2);assert(selection("Defending...")==3);
    assert(selection("Chat.Group1Message6")==5);assert(selection("Group1Message9")==8);
    assert(selection("Group1Message50")==-1);assert(selection("Nice shot!")==-1);
    assert(!tactical(selection("Group2Message1")));assert(!tactical(9));
}
