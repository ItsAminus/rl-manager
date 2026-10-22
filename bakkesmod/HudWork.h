#pragma once
#include <atomic>
#include <chrono>
#include <cstdint>
namespace career_work {
struct Counter {
    std::atomic<uint64_t> calls{0},micros{0},worst{0};
    void record(uint64_t elapsed){
        calls.fetch_add(1,std::memory_order_relaxed);micros.fetch_add(elapsed,std::memory_order_relaxed);
        auto previous=worst.load(std::memory_order_relaxed);
        while(previous<elapsed&&!worst.compare_exchange_weak(previous,elapsed,std::memory_order_relaxed)){}
    }
};
class Scope {
    Counter& counter;std::chrono::steady_clock::time_point start=std::chrono::steady_clock::now();
public:
    explicit Scope(Counter& value):counter(value){}
    ~Scope(){counter.record(std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now()-start).count());}
};
}
