#include "../PlayerShowcase.h"
#include <cassert>
#include <cmath>

int main(){
    using namespace career_showcase;
    assert(presentationTime(2.,100.,100.05,true,10.)>2.04);
    assert(presentationTime(2.,100.,100.05,false,10.)==2.);
    assert(presentationTime(9.9,100.,100.5,true,10.)==10.);
    // Ten-Hz telemetry no longer quantizes animation to ten steps per second.
    auto a=presentationTime(2.,100.,100.+1./144,true,10.);
    auto b=presentationTime(2.,100.,100.+2./144,true,10.);
    assert(b>a);
    assert(cardMotion(0,10).opacity==0);
    assert(cardMotion(.55,10).opacity==1);
    assert(cardMotion(9.8,10).opacity>0&&cardMotion(9.8,10).opacity<1);
    assert(cardMotion(10,10).opacity==0);
    assert(cardMotion(-1,10).opacity==0&&cardMotion(20,10).opacity==0);
    assert(cardMotion(.1,10).offsetY>cardMotion(.4,10).offsetY);
    assert(allowed(true,true,true,false,0,0,0));
    assert(!allowed(false,true,true,false,0,0,0)); // Hosted gameplay never becomes a camera showcase.
    assert(!allowed(true,false,true,false,0,0,0));
    assert(!allowed(true,true,false,false,0,0,0));
    assert(!allowed(true,true,true,true,0,0,0));
    assert(!allowed(true,true,true,false,2,0,0));
    assert(!allowed(true,true,true,false,0,1,0));
    for(int side=0;side<2;side++)for(double t:{-1.,0.,5.,10.,99.}){
        auto shot=orbit(side?950:-950,1000,25,side?3.14159265:0,t,10);
        assert(std::isfinite(shot.pitch)&&std::isfinite(shot.yaw));
        assert(std::abs(shot.x)<1500&&std::abs(shot.y)<1600&&shot.z>100);
        assert(shot.fov==66.);
    }
    auto end=orbit(0,0,0,0,10,10),after=orbit(0,0,0,0,20,10);
    assert(end.x==after.x&&end.y==after.y&&end.pitch==after.pitch);
    // Sampling the same elapsed time at any frame rate gives the same shot.
    auto at30=orbit(0,0,25,0,150./30,10),at144=orbit(0,0,25,0,720./144,10);
    assert(at30.x==at144.x&&at30.yaw==at144.yaw);
}
